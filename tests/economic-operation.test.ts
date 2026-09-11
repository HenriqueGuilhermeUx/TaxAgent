import assert from 'node:assert/strict';
import test from 'node:test';
import { EconomicOperationService } from '../src/document-intake/economic-operation.service';

test('EconomicOperation rejects negative gross amount before persistence', async () => {
  const db: any = { query: async () => { throw new Error('must not persist'); } };
  await assert.rejects(
    new EconomicOperationService(db).create('co_1', 'test', { operation_type: 'purchase', direction: 'outbound', gross_amount: -1 }),
    /gross_amount must be zero or positive/,
  );
});

test('EconomicOperation get computes partially settled status', async () => {
  const responses = [
    { rows: [{ id: 'op_1', company_id: 'co_1', environment: 'test', status: 'open', gross_amount: '100.00' }] },
    { rows: [{ id: 'intake_1' }] },
    { rows: [{ id: 'pay_1', amount: '40.00' }] },
    { rows: [] },
  ];
  const db: any = { query: async () => responses.shift() ?? { rows: [] } };
  const result = await new EconomicOperationService(db).get('op_1', 'co_1', 'test');
  assert.equal(result.status, 'partially_settled');
  assert.equal(result.settlement.paid_amount, 40);
  assert.equal(result.settlement.outstanding_amount, 60);
  assert.equal(result.settlement.document_count, 1);
});

test('EconomicOperation binding refuses two different pre-linked operations', async () => {
  const client: any = {
    query: async (sql: string) => {
      if (sql.includes('FROM document_intakes')) return { rows: [{ id: 'intake_1', economic_operation_id: 'op_a', canonical_document: {} }] };
      if (sql.includes('FROM payment_records')) return { rows: [{ id: 'pay_1', economic_operation_id: 'op_b', amount: '100', direction: 'outbound' }] };
      return { rows: [] };
    },
  };
  const db: any = { withTransaction: async (fn: any) => fn(client) };
  await assert.rejects(
    new EconomicOperationService(db).bindConfirmedMatch('intake_1', 'pay_1', 'co_1', 'test'),
    /different economic operations/,
  );
});
