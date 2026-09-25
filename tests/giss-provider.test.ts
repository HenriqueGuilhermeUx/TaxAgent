import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { GissProvider } from '../src/providers/giss/giss.provider';

const deps = () => ({
  client: {},
  reconciliation: { beforeIssue: async () => { throw new FiscalEngineError('TA_GISS_RECONCILIATION_REQUIRED', 'reconciliation required', false); } },
  artifacts: { save: async () => ({ id: 'doc_test' }) },
  signatures: { signRps: (xml: string) => xml + '<Signature/>', signBatch: (xml: string) => xml + '<Signature/>' },
  sequences: { reserve: async () => 41 },
  tenancy: { getCompany: async () => ({ tax_id: '12345678000190', municipal_registration: '123456' }) },
  vault: { getActiveMaterial: async () => ({}) },
});

const providerFrom = (d: ReturnType<typeof deps>) => new GissProvider(
  d.client as any,
  d.reconciliation as any,
  d.artifacts as any,
  d.signatures as any,
  d.sequences as any,
  d.tenancy as any,
  d.vault as any,
);

const validInput = {
  companyId: 'comp_test',
  environment: 'test' as const,
  issuedAt: '2026-09-22T18:30:00-03:00',
  customer: {
    taxId: '12345678901',
    name: 'Test',
    cityCode: '3548500',
    address: { street: 'Rua Teste', number: '1', district: 'Centro', postalCode: '11010000', cityCode: '3548500' },
  },
  service: {
    description: 'Test',
    amount: 1,
    nationalServiceCode: '170101',
    nbsCode: '114011900',
    serviceLocationCityCode: '3548500',
    issRate: 3,
    issTaxation: '1' as const,
    issWithholding: '1' as const,
  },
};

test('Santos GISS adapter builds and signs schema-complete RPS and batch but fails closed at reconciliation before external transmission', async () => {
  const d = deps();
  const provider = providerFrom(d);
  assert.equal(await provider.canHandle({ companyId: 'comp_test', environment: 'test', issuerCityCode: '3548500', serviceLocationCityCode: '3548500' }), true);
  await assert.rejects(
    provider.issue(validInput, { invoiceId: 'inv_123' }),
    (error: unknown) => error instanceof FiscalEngineError && error.code === 'TA_GISS_RECONCILIATION_REQUIRED' && error.retryable === false,
  );
});

test('Santos GISS adapter refuses an issuer without Municipal Registration before reserving an RPS number', async () => {
  let reserveCalls = 0;
  const d = deps();
  d.tenancy.getCompany = async () => ({ tax_id: '12345678000190', municipal_registration: null });
  d.sequences.reserve = async () => { reserveCalls += 1; return 41; };
  const provider = providerFrom(d);
  await assert.rejects(
    provider.issue(validInput, { invoiceId: 'inv_no_im' }),
    (error: unknown) => error instanceof FiscalEngineError
      && error.code === 'TA_GISS_MUNICIPAL_REGISTRATION_REQUIRED'
      && error.retryable === false,
  );
  assert.equal(reserveCalls, 0);
});

test('Santos GISS emission stays locked even after reconciliation allows the flow to continue', async () => {
  const d = deps();
  d.reconciliation.beforeIssue = async () => undefined;
  const provider = providerFrom(d);

  await assert.rejects(
    provider.issue(validInput, { invoiceId: 'inv_emission_locked' }),
    (error: unknown) => {
      if (!(error instanceof FiscalEngineError)) return false;
      const details = error.details as { transmission_attempted?: boolean; fiscal_emission_attempted?: boolean } | undefined;
      return error.code === 'TA_GISS_EMISSION_LOCKED'
        && error.retryable === false
        && details?.transmission_attempted === false
        && details?.fiscal_emission_attempted === false;
    },
  );
});

test('GISS adapter does not claim municipalities other than Santos', async () => {
  const d = deps();
  const provider = providerFrom(d);
  assert.equal(await provider.canHandle({ companyId: 'comp_test', environment: 'test', issuerCityCode: '3530607', serviceLocationCityCode: '3530607' }), false);
});
