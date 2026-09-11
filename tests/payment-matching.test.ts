import assert from 'node:assert/strict';
import test from 'node:test';
import { PaymentMatchingService } from '../src/document-intake/payment-matching.service';

function dbWithResponses(responses: Array<{ rows: any[] }>) {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  return {
    calls,
    query: async (text: string, params: unknown[] = []) => {
      calls.push({ text, params });
      return responses.shift() ?? { rows: [] };
    },
  } as any;
}

test('PaymentMatching rejects invalid payment amount before persistence', async () => {
  const db = dbWithResponses([]);
  const service = new PaymentMatchingService(db);
  await assert.rejects(
    service.registerPayment('co_1', 'test', { direction: 'outbound', amount: 0, occurred_at: '2026-09-10T12:00:00-03:00' }),
    /Payment amount must be positive/,
  );
  assert.equal(db.calls.length, 0);
});

test('PaymentMatching scores exact amount, counterparty tax id and close date deterministically', async () => {
  const db = dbWithResponses([
    { rows: [{ id: 'intake_1', canonical_document: {
      total: { amount: 100 }, issued_at: '2026-09-10T12:00:00-03:00', supplier: { tax_id: '12.345.678/0001-90' }, customer: {},
    } }] },
    { rows: [{ id: 'pay_1', amount: '100.00', occurred_at: '2026-09-12T12:00:00-03:00', counterparty_tax_id: '12345678000190' }] },
    { rows: [] },
  ]);
  const service = new PaymentMatchingService(db);
  const result = await service.suggest('intake_1', 'co_1', 'test');
  assert.equal(result.matched, true);
  assert.equal(result.suggestions[0].score, 1);
  assert.deepEqual(result.suggestions[0].reasons, ['exact_amount', 'counterparty_tax_id', 'date_within_7_days']);
});

test('PaymentMatching does not suggest weak candidates', async () => {
  const db = dbWithResponses([
    { rows: [{ id: 'intake_1', canonical_document: { total: { amount: 100 }, supplier: {}, customer: {} } }] },
    { rows: [] },
  ]);
  const service = new PaymentMatchingService(db);
  const result = await service.suggest('intake_1', 'co_1', 'test');
  assert.deepEqual(result, { intake_id: 'intake_1', matched: false, suggestions: [] });
});
