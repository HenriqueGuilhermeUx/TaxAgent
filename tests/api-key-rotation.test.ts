import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { ApiKeyRotationController } from '../src/auth/api-key-rotation.controller';
import { ApiKeysService } from '../src/auth/api-keys.service';

const auth = {
  keyId: 'key_old',
  companyId: 'comp_1',
  environment: 'test' as const,
  scopes: ['operations:read', 'operations:write', 'invoices:read', 'invoices:write'],
};

test('rotates current API key atomically with same company, environment and scopes', async () => {
  const txQueries: Array<{ text: string; params: unknown[] }> = [];
  const db = {
    withTransaction: async (fn: any) => fn({
      query: async (text: string, params: unknown[] = []) => {
        txQueries.push({ text, params });
        if (text.startsWith('SELECT id FROM api_keys')) return { rowCount: 1, rows: [{ id: 'key_old' }] };
        return { rowCount: 1, rows: [] };
      },
    }),
  } as any;
  const service = new ApiKeysService(db);
  const result = await service.rotateCurrent(auth, 'Rotated test key');

  assert.equal(result.company_id, 'comp_1');
  assert.equal(result.environment, 'test');
  assert.deepEqual(result.scopes, auth.scopes);
  assert.match(result.key, /^ta_test_/);
  assert.equal(result.previous_key_revoked, true);
  assert.equal(result.key_exposed_once, true);
  assert.equal(txQueries.length, 3);
  assert.match(txQueries[0].text, /FOR UPDATE/);
  assert.match(txQueries[1].text, /INSERT INTO api_keys/);
  assert.match(txQueries[2].text, /revoked_at=NOW/);
  assert.equal(txQueries[2].params[0], 'key_old');
});

test('current key context exposes only safe authentication metadata', () => {
  const controller = new ApiKeyRotationController({} as any);
  const result = controller.current(auth);
  assert.deepEqual(result, {
    key_id: 'key_old',
    company_id: 'comp_1',
    environment: 'test',
    scopes: auth.scopes,
    key_secret_exposed: false,
  });
  assert.equal(JSON.stringify(result).includes('ta_test_'), false);
  assert.throws(() => controller.current(undefined), ForbiddenException);
});

test('rotation controller requires explicit confirmation and authenticated current key', async () => {
  let calls = 0;
  const controller = new ApiKeyRotationController({
    rotateCurrent: async () => { calls += 1; return { ok: true }; },
  } as any);

  await assert.rejects(Promise.resolve().then(() => controller.rotateCurrent(undefined, auth)), ForbiddenException);
  await assert.rejects(Promise.resolve().then(() => controller.rotateCurrent('ROTATE-CURRENT-KEY', undefined)), ForbiddenException);
  assert.equal(calls, 0);

  const result = await controller.rotateCurrent('ROTATE-CURRENT-KEY', auth);
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 1);
});
