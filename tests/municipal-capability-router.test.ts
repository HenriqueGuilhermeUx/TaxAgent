import assert from 'node:assert/strict';
import test from 'node:test';
import { MunicipalCapabilityService } from '../src/municipal-parameters/municipal-capability.service';

test('Santos routes to municipal GISS and never direct SEFIN', async () => {
  const service = new MunicipalCapabilityService({} as any, {} as any);
  const result = await service.resolve('3548500', 'test');
  assert.equal(result.route, 'municipal-provider');
  assert.equal(result.provider, 'giss');
  assert.equal(result.nationalPublicIssuer, false);
});

test('unknown participating municipality fails closed without explicit public issuer evidence', async () => {
  const db = { query: async () => ({ rows: [] }) };
  const client = { getConvention: async () => ({ supported: true, status: 200, payload: { convenio: true } }) };
  const service = new MunicipalCapabilityService(db as any, client as any);
  const result = await service.resolve('3550308', 'test');
  assert.equal(result.route, 'unknown');
  assert.equal(result.nationalStandard, true);
  assert.equal(result.nationalPublicIssuer, false);
});
