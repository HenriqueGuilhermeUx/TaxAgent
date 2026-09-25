import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface EncryptedEnvelope {
  alg: 'aes-256-gcm';
  iv: string;
  tag: string;
  ciphertext: string;
}

@Injectable()
export class EnvelopeCryptoService {
  seal(value: Buffer): EncryptedEnvelope {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
    return {
      alg: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
  }

  open(envelope: EncryptedEnvelope): Buffer {
    if (envelope.alg !== 'aes-256-gcm') throw new Error('Unsupported encrypted envelope algorithm');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
  }

  sealText(value: string): EncryptedEnvelope {
    return this.seal(Buffer.from(value, 'utf8'));
  }

  openText(envelope: EncryptedEnvelope): string {
    return this.open(envelope).toString('utf8');
  }

  private key(): Buffer {
    const encoded = process.env.TAXAGENT_MASTER_KEY_B64;
    if (!encoded) throw new Error('TAXAGENT_MASTER_KEY_B64 is required for encrypted secrets');
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32) throw new Error('TAXAGENT_MASTER_KEY_B64 must decode to exactly 32 bytes');
    return key;
  }
}
