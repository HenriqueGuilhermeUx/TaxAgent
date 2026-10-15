import assert from 'node:assert/strict';
import test from 'node:test';
import { TaxPositionService } from '../src/tax-engine/tax-position.service';

test('TaxPosition filters ledger and financial evidence by environment', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const responses = [
    { rows: [{ tax_type: 'IBS', entry_type: 'debit', amount: '10.00', reference_only: true }] },
    { rows: [{ id: 'ev_1', evidence_type: 'payment_confirmation', intake_id: 'int_1', payment_id: 'pay_1', match_id: 'm_1', invoice_id: 'inv_1', economic_operation_id: null, effective_at: new Date('2026-09-10T12:00:00Z'), amount: '100.00', currency: 'BRL', payload: {} }] },
  ];
  const db: any = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return responses.shift() ?? { rows: [] };
    },
  };
  const result = await new TaxPositionService(db).getPosition('co_1', '2026-09', 'test');
  assert.equal(result.environment, 'test');
  assert.equal(result.position.IBS.debits, 10);
  assert.equal(result.financial_evidence.count, 1);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.sql.includes('environment=$2')));
  assert.deepEqual(calls[0].params, ['co_1', 'test', '2026-09-01']);
  assert.deepEqual(calls[1].params, ['co_1', 'test', '2026-09-01']);
});

test('TaxPosition writes authorized invoice ledger entries with invoice environment', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const responses = [
    { rows: [{ id: 'inv_1', company_id: 'co_1', environment: 'test', tax_decision_id: 'dec_1', status: 'authorized' }] },
    { rows: [{ id: 'dec_1', company_id: 'co_1', effective_at: '2026-09-10', status: 'resolved', output: { calculation: { kind: '2026-test-reference', base: 100, amounts: { ibs: 1, cbs: 2 }, rates: { ibs: 0.01, cbs: 0.02 } } }, sources: [] }] },
    { rows: [] },
    { rows: [] },
  ];
  const db: any = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return responses.shift() ?? { rows: [] };
    },
  };
  await new TaxPositionService(db).recordAuthorizedInvoice('inv_1');
  const inserts = calls.filter((call) => call.sql.includes('INSERT INTO tax_ledger_entries'));
  assert.equal(inserts.length, 2);
  assert.ok(inserts.every((call) => call.sql.includes('environment')));
  assert.ok(inserts.every((call) => call.params[2] === 'test'));
});
