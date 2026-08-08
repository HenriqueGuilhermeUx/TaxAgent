import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import * as forge from 'node-forge';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';

interface Envelope {
  alg: 'aes-256-gcm';
  iv: string;
  tag: string;
  ciphertext: string;
}

export interface CertificateMaterial {
  pfx: Buffer;
  password: string;
  fingerprint: string;
}

@Injectable()
export class CertificateVaultService {
  constructor(private readonly db: DatabaseService) {}

  async store(companyId: string, pfxBase64: string, password: string) {
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
          JSON.stringify(this.encrypt(pfx)),
          JSON.stringify(this.encrypt(Buffer.from(password, 'utf8'))),
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
      encrypted_pfx: Envelope;
      encrypted_password: Envelope;
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
      pfx: this.decrypt(record.encrypted_pfx),
      password: this.decrypt(record.encrypted_password).toString('utf8'),
      fingerprint: record.certificate_fingerprint,
    };
  }

  private key(): Buffer {
    const encoded = process.env.TAXAGENT_MASTER_KEY_B64;
    if (!encoded) throw new Error('TAXAGENT_MASTER_KEY_B64 is required for certificate operations');
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32) throw new Error('TAXAGENT_MASTER_KEY_B64 must decode to exactly 32 bytes');
    return key;
  }

  private encrypt(value: Buffer): Envelope {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
    return { alg: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  }

  private decrypt(envelope: Envelope): Buffer {
    if (envelope.alg !== 'aes-256-gcm') throw new Error('Unsupported certificate envelope algorithm');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
  }

  private inspectPkcs12(pfx: Buffer, password: string) {
    try {
      const der = forge.util.createBuffer(pfx.toString('binary'));
      const asn1 = forge.asn1.fromDer(der);
      const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
      const cert = certBags[0]?.cert;
      if (!cert) throw new Error('Certificate bag not found');
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
