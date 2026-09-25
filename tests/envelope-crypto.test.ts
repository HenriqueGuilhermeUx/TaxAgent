import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { EnvelopeCryptoService } from '../src/security/envelope-crypto.service';

test('AES-256-GCM envelope round trips and authenticates ciphertext', () => {
  process.env.TAXAGENT_MASTER_KEY_B64 = randomBytes(32).toString('base64');
  const crypto = new EnvelopeCryptoService();
  const envelope = crypto.sealText('taxagent-secret');
  assert.equal(crypto.openText(envelope), 'taxagent-secret');
  assert.equal(envelope.alg, 'aes-256-gcm');
  const corrupted = { ...envelope, ciphertext: Buffer.from('corrupted').toString('base64') };
  assert.throws(() => crypto.openText(corrupted));
});
