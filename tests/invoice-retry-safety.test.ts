import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { InvoicesService } from '../src/invoices/invoices.service';

function fixture(invoice?: any) {
  const calls = {
    markRetrying: 0,
    saveResult: [] as any[],
    finishAttempt: [] as any[],
    ledger: [] as any[],
    jobs: [] as any[],
    webhooks: [] as any[],
  };
  const repository = {
    async findById() {
      return invoice ?? {
        id: 'inv_test',
        company_id: 'comp_test',
        environment: 'test',
        status: 'retrying',
        prepared_dps_id: 'pdps_test',
      };
    },
    async markRetrying() { calls.markRetrying += 1; },
    async saveResult(_id: string, result: any) { calls.saveResult.push(result); },
    async finishAttempt(...args: any[]) { calls.finishAttempt.push(args); },
  };
  const ledger = { async append(entry: any) { calls.ledger.push(entry); } };
  const jobs = { async enqueue(type: string, payload: any) { calls.jobs.push({ type, payload }); return 'job_test'; } };
  const webhooks = { async emit(_companyId: string, type: string, payload: any) { calls.webhooks.push({ type, payload }); } };
  const service = new InvoicesService(
    repository as any,
    {} as any,
    {} as any,
    {} as any,
    ledger as any,
    jobs as any,
    webhooks as any,
    {} as any,
    {} as any,
  );
  return { service, calls };
}

test('retryable issuance uncertainty never becomes a false fiscal rejection after retry exhaustion', async () => {
  const f = fixture();
  await (f.service as any).handleIssueFailure(
    'inv_test',
    'comp_test',
    'att_test',
    5,
    new FiscalEngineError(
      'NFSE_AUTHORIZATION_PROOF_INCOMPLETE',
      'access key exists but official XML is still unavailable',
      true,
    ),
  );

  assert.equal(f.calls.markRetrying, 1);
  assert.equal(f.calls.saveResult.length, 0);
  assert.equal(f.calls.finishAttempt.length, 1);
  assert.equal(f.calls.ledger.at(-1)?.type, 'invoice.retry_exhausted_operator_attention_required');
  assert.equal(f.calls.ledger.at(-1)?.payload?.fiscal_rejection_proven, false);
  assert.equal(f.calls.webhooks.at(-1)?.type, 'invoice.retry_exhausted_operator_attention_required');
  assert.equal(f.calls.webhooks.at(-1)?.payload?.status, 'retrying');
});

test('non-retryable engine failure can still become a definitive rejected invoice', async () => {
  const f = fixture();
  await (f.service as any).handleIssueFailure(
    'inv_test',
    'comp_test',
    undefined,
    1,
    new FiscalEngineError('TA_INVALID_FISCAL_INPUT', 'invalid deterministic fiscal input', false),
  );

  assert.equal(f.calls.markRetrying, 0);
  assert.equal(f.calls.saveResult.length, 1);
  assert.equal(f.calls.saveResult[0].status, 'rejected');
  assert.equal(f.calls.saveResult[0].rejection.code, 'TA_INVALID_FISCAL_INPUT');
  assert.equal(f.calls.ledger.at(-1)?.type, 'invoice.rejected');
});

test('manual Prepared DPS recovery only enqueues reconciliation-first processing for TEST retrying invoice', async () => {
  const f = fixture();
  const result = await f.service.reconcilePreparedNational('inv_test', 'comp_test');

  assert.equal(result.status, 'retrying');
  assert.equal(result.prepared_dps_id, 'pdps_test');
  assert.equal(result.strategy, 'reconcile_by_dps_before_any_post');
  assert.equal(result.blind_repost_allowed, false);
  assert.equal(f.calls.jobs.length, 1);
  assert.deepEqual(f.calls.jobs[0], { type: 'issue_invoice', payload: { invoiceId: 'inv_test' } });
  assert.equal(f.calls.ledger.at(-1)?.type, 'invoice.reconciliation_requested');
  assert.equal(f.calls.ledger.at(-1)?.payload?.fiscal_retransmission_authorized, false);
});

test('manual Prepared DPS recovery refuses non-TEST or non-retrying invoice', async () => {
  const production = fixture({
    id: 'inv_prod',
    company_id: 'comp_test',
    environment: 'production',
    status: 'retrying',
    prepared_dps_id: 'pdps_test',
  });
  await assert.rejects(() => production.service.reconcilePreparedNational('inv_prod', 'comp_test'));

  const terminal = fixture({
    id: 'inv_auth',
    company_id: 'comp_test',
    environment: 'test',
    status: 'authorized',
    prepared_dps_id: 'pdps_test',
  });
  await assert.rejects(() => terminal.service.reconcilePreparedNational('inv_auth', 'comp_test'));
});
