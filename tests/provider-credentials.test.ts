import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderCredentialsService } from '../src/provider-credentials/provider-credentials.service';

test('provider credential metadata never returns secret values and new credentials start pending', async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const db = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (sql.startsWith('SELECT id FROM companies')) return { rowCount: 1, rows: [{ id: 'cmp_1' }] };
      return {
        rowCount: 1,
        rows: [{
          id: 'pcred_1', company_id: 'cmp_1', provider: 'giss', environment: 'test',
          credential_keys: ['login', 'password'], status: 'pending', verification_metadata: {},
          verified_at: null, created_at: new Date(), updated_at: new Date(),
        }],
      };
    },
  };
  const crypto = { sealText: (value: string) => ({ alg: 'aes-256-gcm', iv: 'iv', tag: 'tag', ciphertext: `sealed:${value.length}` }) };
  const service = new ProviderCredentialsService(db as any, crypto as any);
  const result = await service.store('cmp_1', 'GISS', 'test', { login: 'user', password: 'super-secret' });

  assert.equal(result.status, 'pending');
  assert.deepEqual(result.credential_keys, ['login', 'password']);
  assert.equal(result.secrets_exposed, false);
  assert.equal(JSON.stringify(result).includes('super-secret'), false);
  assert.equal(JSON.stringify(result).includes('user'), false);
  assert.equal(JSON.stringify(queries).includes('super-secret'), false);
});

test('verified provider credentials are decrypted only through internal service method', async () => {
  const db = {
    query: async () => ({
      rowCount: 1,
      rows: [{
        id: 'pcred_1', company_id: 'cmp_1', provider: 'giss', environment: 'test',
        encrypted_credentials: { alg: 'aes-256-gcm', iv: 'iv', tag: 'tag', ciphertext: 'cipher' },
        credential_keys: ['login'], status: 'verified', verification_metadata: {},
        verified_at: new Date(), created_at: new Date(), updated_at: new Date(),
      }],
    }),
  };
  const crypto = { openText: () => JSON.stringify({ login: 'verified-user' }) };
  const service = new ProviderCredentialsService(db as any, crypto as any);
  assert.deepEqual(await service.getVerifiedCredentials('cmp_1', 'giss', 'test'), { login: 'verified-user' });
});
