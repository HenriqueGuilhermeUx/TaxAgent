import assert from 'node:assert/strict';
import test from 'node:test';
import { ReconciliationCasesService } from '../src/document-intake/reconciliation-cases.service';

function service() {
  const db = { query: async () => ({ rows: [] }), withTransaction: async (fn: any) => fn({ query: async () => ({ rows: [] }) }) } as any;
  const webhooks = { emit: async () => undefined } as any;
  return new ReconciliationCasesService(db, webhooks);
}

test('Reconciliation cases require a note when resolving', async () => {
  await assert.rejects(
    service().transition('case_1', 'co_1', 'test', 'resolved', 'paid_elsewhere', ''),
    /note is required/i,
  );
});

test('Reconciliation cases require a note when ignored', async () => {
  await assert.rejects(
    service().transition('case_1', 'co_1', 'test', 'ignored', 'false_positive'),
    /note is required/i,
  );
});

test('Reconciliation cases reject unknown status before touching persistence', async () => {
  await assert.rejects(
    service().transition('case_1', 'co_1', 'test', 'invalid' as any),
    /Invalid reconciliation case status/,
  );
});
