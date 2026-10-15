import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { FiscalRouterService } from '../src/fiscal-core/fiscal-router.service';
import { FiscalContext } from '../src/fiscal-core/fiscal.types';

const context: FiscalContext = {
  companyId: 'cmp_test',
  environment: 'test',
  issuerCityCode: '3550308',
  serviceLocationCityCode: '3550308',
  taxRegime: 'regular',
  effectiveAt: '2026-09-24',
};

test('Fiscal Router uses PlugNotas only as fallback after native routes are unresolved', async () => {
  const national = { name: 'nfse-national' };
  const giss = { name: 'giss' };
  const plugnotas = { name: 'plugnotas', canHandle: async () => true };
  const capabilities = { resolve: async () => ({ route: 'unknown', provider: 'unknown' }) };
  const router = new FiscalRouterService(national as any, capabilities as any, giss as any, plugnotas as any);

  assert.equal(await router.resolve(context), plugnotas);
});

test('Fiscal Router keeps National direct route ahead of gateway', async () => {
  const national = { name: 'nfse-national' };
  const giss = { name: 'giss' };
  let gatewayChecked = false;
  const plugnotas = { name: 'plugnotas', canHandle: async () => { gatewayChecked = true; return true; } };
  const capabilities = { resolve: async () => ({ route: 'national-direct', provider: 'nfse-national' }) };
  const router = new FiscalRouterService(national as any, capabilities as any, giss as any, plugnotas as any);

  assert.equal(await router.resolve(context), national);
  assert.equal(gatewayChecked, false);
});

test('Fiscal Router keeps native GISS route ahead of gateway', async () => {
  const national = { name: 'nfse-national' };
  const giss = { name: 'giss' };
  let gatewayChecked = false;
  const plugnotas = { name: 'plugnotas', canHandle: async () => { gatewayChecked = true; return true; } };
  const capabilities = { resolve: async () => ({ route: 'municipal-provider', provider: 'giss' }) };
  const router = new FiscalRouterService(national as any, capabilities as any, giss as any, plugnotas as any);

  assert.equal(await router.resolve({ ...context, issuerCityCode: '3548500' }), giss);
  assert.equal(gatewayChecked, false);
});

test('Fiscal Router still fails closed when neither native nor gateway route is verified', async () => {
  const plugnotas = { name: 'plugnotas', canHandle: async () => false };
  const capabilities = { resolve: async () => ({ route: 'unknown', provider: 'unknown' }) };
  const router = new FiscalRouterService({} as any, capabilities as any, {} as any, plugnotas as any);

  await assert.rejects(
    () => router.resolve(context),
    (error: unknown) => error instanceof FiscalEngineError && error.code === 'TA_MUNICIPAL_ROUTE_UNVERIFIED',
  );
});
