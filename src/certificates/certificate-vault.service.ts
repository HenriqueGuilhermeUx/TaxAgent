import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as forge from 'node-forge';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { EncryptedEnvelope, EnvelopeCryptoService } from '../security/envelope-crypto.service';
import { extractIcpBrasilCnpj, loadPkcs12Identity } from './pkcs12-identity';

export interface CertificateMaterial {
  pfx: Buffer;
  password: string;
  fingerprint: string;
  subjectTaxId?: string;
}

@Injectable()
export class CertificateVaultService {
  constructor(private readonly db: DatabaseService, private readonly crypto: EnvelopeCryptoService) {}

  async store(companyId: string, pfxBase64: string, password: string) {
    const company = await this.db.query<{ id: string; tax_id: string }>('SELECT id, tax_id FROM companies WHERE id=$1', [companyId]);
    if (!company.rowCount || !company.rows[0]) throw new NotFoundException('Company not found');

    const pfx = Buffer.from(pfxBase64, 'base64');
    if (pfx.length < 64) throw new BadRequestException('Invalid or empty PKCS#12 payload');
    const metadata = this.inspectPkcs12(pfx, password);
    const companyTaxId = normalizeTaxId(company.rows[0].tax_id);
    if (!metadata.subjectTaxId) throw new BadRequestException('A1 certificate does not expose the ICP-Brasil legal-person CNPJ OID 2.16.76.1.3.3');
    if (metadata.subjectTaxId !== companyTaxId) throw new BadRequestException(`A1 certificate CNPJ ${metadata.subjectTaxId} does not match company CNPJ ${companyTaxId}`);
    const id = createId('cert');

    await this.db.withTransaction(async (client) => {
      await client.query("UPDATE certificates SET status='revoked' WHERE company_id=$1 AND status='active'", [companyId]);
      await client.query(
        `INSERT INTO certificates(
          id, company_id, encrypted_pfx, encrypted_password, certificate_fingerprint,
          serial_number, subject, issuer, valid_from, valid_to, subject_tax_id
        ) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8,$9,$10,$11)`,
        [id, companyId, JSON.stringify(this.crypto.seal(pfx)), JSON.stringify(this.crypto.sealText(password)), metadata.fingerprint, metadata.serialNumber, metadata.subject, metadata.issuer, metadata.validFrom, metadata.validTo, metadata.subjectTaxId],
      );
    });
    return { id, company_id: companyId, status: 'active', ...metadata };
  }

  async metadata(companyId: string) {
    const { rows } = await this.db.query(
      `SELECT id, company_id, status, certificate_fingerprint, subject_tax_id, serial_number, subject, issuer, valid_from, valid_to, created_at
       FROM certificates WHERE company_id=$1 ORDER BY created_at DESC`,
      [companyId],
    );
    return rows;
  }

  async getActiveMaterial(companyId: string): Promise<CertificateMaterial> {
    const { rows } = await this.db.query<{ encrypted_pfx: EncryptedEnvelope; encrypted_password: EncryptedEnvelope; certificate_fingerprint: string; subject_tax_id: string | null; valid_to: Date | null }>(
      "SELECT encrypted_pfx, encrypted_password, certificate_fingerprint, subject_tax_id, valid_to FROM certificates WHERE company_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1",
      [companyId],
    );
    const record = rows[0];
    if (!record) throw new NotFoundException('Active certificate not found for company');
    if (record.valid_to && record.valid_to.getTime() <= Date.now()) throw new BadRequestException('Active certificate is expired');
    return { pfx: this.crypto.open(record.encrypted_pfx), password: this.crypto.openText(record.encrypted_password), fingerprint: record.certificate_fingerprint, subjectTaxId: record.subject_tax_id ?? undefined };
  }

  private inspectPkcs12(pfx: Buffer, password: string) {
    try {
      const { certificate } = loadPkcs12Identity(pfx, password);
      const now = Date.now();
      if (certificate.validity.notAfter.getTime() <= now) throw new Error(`Certificate expired at ${certificate.validity.notAfter.toISOString()}`);
      if (certificate.validity.notBefore.getTime() > now + 5 * 60_000) throw new Error(`Certificate is not valid before ${certificate.validity.notBefore.toISOString()}`);
      const certDer = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes(), 'binary');
      const label = (attrs: forge.pki.CertificateField[]) => attrs.map((a) => `${a.shortName ?? a.name}=${a.value}`).join(',');
      return {
        fingerprint: createHash('sha256').update(certDer).digest('hex'),
        subjectTaxId: extractIcpBrasilCnpj(certificate),
        serialNumber: certificate.serialNumber,
        subject: label(certificate.subject.attributes),
        issuer: label(certificate.issuer.attributes),
        validFrom: certificate.validity.notBefore,
        validTo: certificate.validity.notAfter,
      };
    } catch (error) {
      throw new BadRequestException(`Unable to open PKCS#12 certificate: ${error instanceof Error ? error.message : 'invalid certificate'}`);
    }
  }
}

function normalizeTaxId(value: string): string {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
