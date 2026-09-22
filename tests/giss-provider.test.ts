import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { GissProvider } from '../src/providers/giss/giss.provider';

const deps = () => ({
  client: {},
  reconciliation: { beforeIssue: async () => { throw new FiscalEngineError('TA_GISS_RECONCILIATION_REQUIRED', 'reconciliation required', false); } },
  artifacts: { save: async () => ({ id: 'doc_test' }) },
  signatures: { signRps: (xml: string) => xml + '<Signature/>' },
  tenancy: { getCompany: async () => ({ tax_id: '12345678000190', municipal_registration: null }) },
  vault: { getActiveMaterial: async () => ({}) },
});

test('Santos GISS adapter builds and signs RPS but fails closed at reconciliation before external transmission', async () => {
  const d = deps();
  const provider = new GissProvider(d.client as any, d.reconciliation as any, d.artifacts as any, d.signatures as any, d.tenancy as any, d.vault as any);
  assert.equal(await provider.canHandle({ companyId: 'comp_test', environment: 'test', issuerCityCode: '3548500', serviceLocationCityCode: '3548500' }), true);
  await assert.rejects(
    provider.issue({ companyId: 'comp_test', environment: 'test', issuedAt: '2026-09-22T18:30:00-03:00', customer: { taxId: '12345678901', name: 'Test', cityCode: '3548500' }, service: { description: 'Test', amount: 1, nationalServiceCode: '170101', serviceLocationCityCode: '3548500', issRate: 3 } }, { invoiceId: 'inv_123' }),
    (error: unknown) => error instanceof FiscalEngineError && error.code === 'TA_GISS_RECONCILIATION_REQUIRED' && error.retryable === false,
  );
});

test('GISS adapter does not claim municipalities other than Santos', async () => {
  const d = deps();
  const provider = new GissProvider(d.client as any, d.reconciliation as any, d.artifacts as any, d.signatures as any, d.tenancy as any, d.vault as any);
  assert.equal(await provider.canHandle({ companyId: 'comp_test', environment: 'test', issuerCityCode: '3530607', serviceLocationCityCode: '3530607' }), false);
});
