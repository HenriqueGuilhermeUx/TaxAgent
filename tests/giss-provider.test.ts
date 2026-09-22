import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { GissProvider } from '../src/providers/giss/giss.provider';

test('Santos GISS adapter is selected but fails closed before external transmission', async () => {
  const provider = new GissProvider({} as any);
  assert.equal(await provider.canHandle({ companyId: 'comp_test', environment: 'test', issuerCityCode: '3548500', serviceLocationCityCode: '3548500' }), true);
  await assert.rejects(
    provider.issue({ companyId: 'comp_test', environment: 'test', customer: { taxId: '00000000000', name: 'Test', cityCode: '3548500' }, service: { description: 'Test', amount: 1 } }, { invoiceId: 'inv_test' }),
    (error: unknown) => error instanceof FiscalEngineError && error.code === 'TA_GISS_INTEGRATION_NOT_CONFIGURED' && error.retryable === false,
  );
});

test('GISS adapter does not claim municipalities other than Santos', async () => {
  const provider = new GissProvider({} as any);
  assert.equal(await provider.canHandle({ companyId: 'comp_test', environment: 'test', issuerCityCode: '3530607', serviceLocationCityCode: '3530607' }), false);
});
