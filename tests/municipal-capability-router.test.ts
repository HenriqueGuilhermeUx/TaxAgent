import assert from 'node:assert/strict';
import test from 'node:test';
import { MunicipalCapabilityService } from '../src/municipal-parameters/municipal-capability.service';

test('Santos regular routes to municipal GISS and never direct SEFIN', async () => {
  const service = new MunicipalCapabilityService({} as any, {} as any);
  const result = await service.resolve('3548500', 'test', { taxRegime: 'regular', effectiveAt: '2026-09-24' });
  assert.equal(result.route, 'municipal-provider');
  assert.equal(result.provider, 'giss');
  assert.equal(result.nationalPublicIssuer, false);
});

test('unknown participating municipality fails closed without explicit public issuer evidence', async () => {
  const db = { query: async () => ({ rows: [] }) };
  const client = { getConvention: async () => ({ supported: true, status: 200, payload: { convenio: true } }) };
  const service = new MunicipalCapabilityService(db as any, client as any);
  const result = await service.resolve('3550308', 'test', { taxRegime: 'regular', effectiveAt: '2026-09-24' });
  assert.equal(result.route, 'unknown');
  assert.equal(result.nationalStandard, true);
  assert.equal(result.nationalPublicIssuer, false);
});

test('Simples Nacional routes national-direct from 2026-11-01 under CGSN 191/2026', async () => {
  const service = new MunicipalCapabilityService({} as any, {} as any);
  const result = await service.resolve('3530607', 'test', { taxRegime: 'simples_nacional', effectiveAt: '2026-11-01' });
  assert.equal(result.route, 'national-direct');
  assert.equal(result.provider, 'nfse-national');
  assert.equal(result.source, 'official-regime-rule');
});

test('Simples Nacional does not use the postponed mandatory rule before 2026-11-01', async () => {
  const db = { query: async () => ({ rows: [] }) };
  const client = { getConvention: async () => ({ supported: true, status: 200, payload: { convenio: true } }) };
  const service = new MunicipalCapabilityService(db as any, client as any);
  const result = await service.resolve('3530607', 'test', { taxRegime: 'simples_nacional', effectiveAt: '2026-10-31' });
  assert.equal(result.route, 'unknown');
});

test('Santos Simples taxpayer remains on municipal provider before 2026-11-01', async () => {
  const service = new MunicipalCapabilityService({} as any, {} as any);
  const result = await service.resolve('3548500', 'test', { taxRegime: 'simples_nacional', effectiveAt: '2026-09-24' });
  assert.equal(result.route, 'municipal-provider');
  assert.equal(result.provider, 'giss');
});

test('Santos Simples taxpayer routes national-direct on or after 2026-11-01', async () => {
  const service = new MunicipalCapabilityService({} as any, {} as any);
  const result = await service.resolve('3548500', 'test', { taxRegime: 'simples_nacional', effectiveAt: '2026-11-01' });
  assert.equal(result.route, 'national-direct');
  assert.equal(result.provider, 'nfse-national');
  assert.equal(result.source, 'official-regime-rule');
});
