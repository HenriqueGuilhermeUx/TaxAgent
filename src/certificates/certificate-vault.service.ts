import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as forge from 'node-forge';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { EncryptedEnvelope, EnvelopeCryptoService } from '../security/envelope-crypto.service';

export interface CertificateMaterial {
  pfx: Buffer;
  password: string;
  fingerprint: string;
}

@Injectable()
export class CertificateVaultService {
  constructor(private readonly db: DatabaseService, private readonly crypto: EnvelopeCryptoService) {}

  async store(companyId: string, pfxBase64: string, password: string) {
    const company = await this.db.query('SELECT id FROM companies WHERE id=$1', [companyId]);
    if (!company.rowCount) throw new NotFoundException('Company not found');

    const pfx = Buffer.from(pfxBase64, 'base64');
    if (pfx.length < 64) throw new BadRequestException('Invalid or empty PKCS#12 payload');
    const metadata = this.inspectPkcs12(pfx, password);
    const id = createId('cert');

    await this.db.withTransaction(async (client) => {
      await client.query("UPDATE certificates SET status='revoked' WHERE company_id=$1 AND status='active'", [companyId]);
      await client.query(
        `INSERT INTO certificates(
          id, company_id, encrypted_pfx, encrypted_password, certificate_fingerprint,
          serial_number, subject, issuer, valid_from, valid_to
        ) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8,$9,$10)`,
        [
          id,
          companyId,
          JSON.stringify(this.crypto.seal(pfx)),
          JSON.stringify(this.crypto.sealText(password)),
          metadata.fingerprint,
          metadata.serialNumber,
          metadata.subject,
          metadata.issuer,
          metadata.validFrom,
          metadata.validTo,
        ],
      );
    });
    return { id, company_id: companyId, status: 'active', ...metadata };
  }

  async metadata(companyId: string) {
    const { rows } = await this.db.query(
      `SELECT id, company_id, status, certificate_fingerprint, serial_number, subject, issuer, valid_from, valid_to, created_at
       FROM certificates WHERE company_id=$1 ORDER BY created_at DESC`,
      [companyId],
    );
    return rows;
  }

  async getActiveMaterial(companyId: string): Promise<CertificateMaterial> {
    const { rows } = await this.db.query<{
      encrypted_pfx: EncryptedEnvelope;
      encrypted_password: EncryptedEnvelope;
      certificate_fingerprint: string;
      valid_to: Date | null;
    }>(
      "SELECT encrypted_pfx, encrypted_password, certificate_fingerprint, valid_to FROM certificates WHERE company_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1",
      [companyId],
    );
    const record = rows[0];
    if (!record) throw new NotFoundException('Active certificate not found for company');
    if (record.valid_to && record.valid_to.getTime() <= Date.now()) throw new BadRequestException('Active certificate is expired');
    return {
      pfx: this.crypto.open(record.encrypted_pfx),
      password: this.crypto.openText(record.encrypted_password),
      fingerprint: record.certificate_fingerprint,
    };
  }

  private inspectPkcs12(pfx: Buffer, password: string) {
    try {
      const der = forge.util.createBuffer(pfx.toString('binary'));
      const asn1 = forge.asn1.fromDer(der);
      const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
      const shroudedKeyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
      const keyBags = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [];
      const cert = certBags[0]?.cert;
      const privateKey = [...shroudedKeyBags, ...keyBags].find((bag) => Boolean(bag.key))?.key;
      if (!cert) throw new Error('Certificate bag not found');
      if (!privateKey) throw new Error('Private key bag not found; TaxAgent requires a complete A1 PKCS#12/PFX');
      const now = Date.now();
      if (cert.validity.notAfter.getTime() <= now) throw new Error(`Certificate expired at ${cert.validity.notAfter.toISOString()}`);
      if (cert.validity.notBefore.getTime() > now + 5 * 60_000) throw new Error(`Certificate is not valid before ${cert.validity.notBefore.toISOString()}`);
      const certDer = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(), 'binary');
      const label = (attrs: forge.pki.CertificateField[]) => attrs.map((a) => `${a.shortName ?? a.name}=${a.value}`).join(',');
      return {
        fingerprint: createHash('sha256').update(certDer).digest('hex'),
        serialNumber: cert.serialNumber,
        subject: label(cert.subject.attributes),
        issuer: label(cert.issuer.attributes),
        validFrom: cert.validity.notBefore,
        validTo: cert.validity.notAfter,
      };
    } catch (error) {
      throw new BadRequestException(`Unable to open PKCS#12 certificate: ${error instanceof Error ? error.message : 'invalid certificate'}`);
    }
  }
}
