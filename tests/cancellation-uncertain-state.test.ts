import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { InvoicesService } from '../src/invoices/invoices.service';

function fixture(error: Error) {
  let restoreAuthorizedCalls = 0;
  const ledgerEvents: string[] = [];
  const webhookEvents: string[] = [];
  const invoice = {
    id: 'inv_test',
    company_id: 'comp_test',
    environment: 'test' as const,
    status: 'cancelling',
    access_key: '35306072200000000000000000000000000126090000000000',
    prepared_dps_id: 'pdps_test',
    canonical_input: {
      companyId: 'comp_test',
      environment: 'test' as const,
      competence: '2026-09-24',
      customer: { taxId: '00000000000000', name: 'Cliente Teste', cityCode: '3530607' },
      service: { description: 'Serviço de teste', amount: 100, serviceLocationCityCode: '3530607' },
    },
  };

  const repository = {
    async findById() { return invoice; },
    async restoreAuthorized() { restoreAuthorizedCalls += 1; },
    async createFiscalEvent() { throw new Error('must not create event on provider exception'); },
  };
  const provider = {
    name: 'nfse-national',
    async cancel() { throw error; },
  };
  const router = { async resolve() { return provider; } };
  const ledger = { async append(entry: any) { ledgerEvents.push(entry.type); } };
  const webhooks = { async emit(_companyId: string, type: string) { webhookEvents.push(type); } };
  const tenancy = { async getCompany() { return { city_code: '3530607', tax_regime: 'regular' }; } };

  const service = new InvoicesService(
    repository as any,
    router as any,
    {} as any,
    {} as any,
    ledger as any,
    {} as any,
    webhooks as any,
    tenancy as any,
    {} as any,
  );

  return {
    service,
    restoreAuthorizedCalls: () => restoreAuthorizedCalls,
    ledgerEvents,
    webhookEvents,
  };
}

test('uncertain cancellation retries without restoring authorized while reconciliation attempts remain', async () => {
  const f = fixture(new FiscalEngineError('TA_NFSE_EVENT_RECONCILIATION_PENDING', 'provider state unknown', true));

  await assert.rejects(
    () => f.service.processCancellation('inv_test', '1', 'Cancelamento de teste', 1),
    /provider state unknown/,
  );
  assert.equal(f.restoreAuthorizedCalls(), 0);
  assert.deepEqual(f.ledgerEvents, ['invoice.cancellation_reconciliation_retry_scheduled']);
});

test('uncertain cancellation remains cancelling after retry budget is exhausted', async () => {
  const f = fixture(new FiscalEngineError('TA_NFSE_EVENT_RECONCILIATION_PENDING', 'provider state unknown', true));

  await f.service.processCancellation('inv_test', '1', 'Cancelamento de teste', 5);

  assert.equal(f.restoreAuthorizedCalls(), 0);
  assert.deepEqual(f.ledgerEvents, ['invoice.cancellation_reconciliation_required']);
  assert.deepEqual(f.webhookEvents, ['invoice.cancellation_reconciliation_required']);
});

test('incomplete SEFIN event response is also treated as uncertain provider state', async () => {
  const f = fixture(new FiscalEngineError('NFSE_EVENT_RESPONSE_INCOMPLETE', 'missing event XML', true));

  await f.service.processCancellation('inv_test', '1', 'Cancelamento de teste', 5);

  assert.equal(f.restoreAuthorizedCalls(), 0);
  assert.deepEqual(f.ledgerEvents, ['invoice.cancellation_reconciliation_required']);
});

test('ordinary exhausted transient error still restores authorized when no fiscal POST state is uncertain', async () => {
  const f = fixture(new FiscalEngineError('NFSE_TRANSIENT_HTTP', 'pre-POST query unavailable', true));

  await f.service.processCancellation('inv_test', '1', 'Cancelamento de teste', 5);

  assert.equal(f.restoreAuthorizedCalls(), 1);
  assert.deepEqual(f.ledgerEvents, ['invoice.cancellation_failed']);
  assert.deepEqual(f.webhookEvents, ['invoice.cancellation_failed']);
});
