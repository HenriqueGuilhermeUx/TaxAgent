import assert from 'node:assert/strict';
import test from 'node:test';
import { PaymentMatchingService } from '../src/document-intake/payment-matching.service';

function dbWithResponses(responses: Array<{ rows: any[] }>) {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  return { calls, query: async (text: string, params: unknown[] = []) => { calls.push({ text, params }); return responses.shift() ?? { rows: [] }; } } as any;
}

test('PaymentMatching rejects invalid payment amount before persistence', async () => {
  const db = dbWithResponses([]); const service = new PaymentMatchingService(db);
  await assert.rejects(service.registerPayment('co_1', 'test', { direction: 'outbound', amount: 0, occurred_at: '2026-09-10T12:00:00-03:00' }), /Payment amount must be positive/);
  assert.equal(db.calls.length, 0);
});

test('PaymentMatching scores exact amount, counterparty tax id and close date deterministically', async () => {
  const db = dbWithResponses([
    { rows: [{ id: 'intake_1', canonical_document: { total: { amount: 100 }, issued_at: '2026-09-10T12:00:00-03:00', supplier: { tax_id: '12.345.678/0001-90' }, customer: {} } }] },
    { rows: [{ id: 'pay_1', amount: '100.00', occurred_at: '2026-09-12T12:00:00-03:00', counterparty_tax_id: '12345678000190' }] }, { rows: [] },
  ]);
  const result = await new PaymentMatchingService(db).suggest('intake_1', 'co_1', 'test');
  assert.equal(result.matched, true); assert.equal(result.suggestions[0].score, 1);
  assert.deepEqual(result.suggestions[0].reasons, ['exact_amount', 'counterparty_tax_id', 'date_within_7_days']);
});

test('PaymentMatching does not suggest weak candidates', async () => {
  const db = dbWithResponses([{ rows: [{ id: 'intake_1', canonical_document: { total: { amount: 100 }, supplier: {}, customer: {} } }] }, { rows: [] }]);
  assert.deepEqual(await new PaymentMatchingService(db).suggest('intake_1', 'co_1', 'test'), { intake_id: 'intake_1', matched: false, suggestions: [] });
});

test('Reconciliation report separates missing payment and missing document without tax effects', async () => {
  const db = dbWithResponses([
    { rows: [{ id: 'intake_1', canonical_document: { document_number: 'NF-1', total: { amount: 250, currency: 'BRL' } }, has_confirmed_payment: false, best_score: '0' }] },
    { rows: [{ id: 'pay_1', external_id: 'pix-1', amount: '300.00', currency: 'BRL', occurred_at: '2026-09-11T10:00:00Z', has_confirmed_document: false, suggestion_count: 0 }] },
  ]);
  const report = await new PaymentMatchingService(db).reconciliationReport('co_1', 'test', 45);
  assert.equal(report.status, 'attention_required'); assert.equal(report.summary.issues, 2); assert.equal(report.summary.high_severity, 2);
  assert.deepEqual(report.issues.map((i) => i.type), ['document_without_payment', 'payment_without_document']);
  assert.equal(report.authoritative_tax_effects_applied, false);
});

test('Reconciliation report marks unconfirmed candidates as medium severity', async () => {
  const db = dbWithResponses([
    { rows: [{ id: 'intake_1', canonical_document: { total: { amount: 100 } }, has_confirmed_payment: false, best_score: '0.85' }] },
    { rows: [{ id: 'pay_1', amount: '100', currency: 'BRL', occurred_at: '2026-09-11T10:00:00Z', has_confirmed_document: false, suggestion_count: 1 }] },
  ]);
  const report = await new PaymentMatchingService(db).reconciliationReport('co_1', 'test', 45);
  assert.equal(report.summary.medium_severity, 2); assert.equal(report.summary.high_severity, 0);
  assert.deepEqual(report.issues.map((i) => i.type), ['document_match_unconfirmed', 'payment_match_unconfirmed']);
});

test('Reconciliation report detects underpayment when tax id and date align', async () => {
  const db = dbWithResponses([
    { rows: [{ id: 'intake_1', canonical_document: { document_number: 'NF-2', total: { amount: 500, currency: 'BRL' }, issued_at: '2026-09-10T12:00:00Z', supplier: { tax_id: '12345678000190' }, customer: {} }, has_confirmed_payment: false, best_score: '0' }] },
    { rows: [{ id: 'pay_1', amount: '450', currency: 'BRL', occurred_at: '2026-09-11T12:00:00Z', counterparty_tax_id: '12345678000190', has_confirmed_document: false, suggestion_count: 0 }] },
  ]);
  const report = await new PaymentMatchingService(db).reconciliationReport('co_1', 'test', 45);
  assert.equal(report.summary.issues, 1);
  assert.equal(report.issues[0].type, 'payment_under_amount');
  assert.equal(report.issues[0].delta, -50);
  assert.equal(report.issues[0].payment_id, 'pay_1');
});

test('Reconciliation report detects exact-value counterparty divergence', async () => {
  const db = dbWithResponses([
    { rows: [{ id: 'intake_1', canonical_document: { document_number: 'NF-3', total: { amount: 700, currency: 'BRL' }, issued_at: '2026-09-10T12:00:00Z', supplier: { tax_id: '11111111000111' }, customer: {} }, has_confirmed_payment: false, best_score: '0' }] },
    { rows: [{ id: 'pay_1', amount: '700', currency: 'BRL', occurred_at: '2026-09-11T12:00:00Z', counterparty_tax_id: '22222222000122', has_confirmed_document: false, suggestion_count: 0 }] },
  ]);
  const report = await new PaymentMatchingService(db).reconciliationReport('co_1', 'test', 45);
  assert.equal(report.summary.issues, 1);
  assert.equal(report.issues[0].type, 'counterparty_divergence');
  assert.equal(report.issues[0].payment_id, 'pay_1');
  assert.deepEqual(report.issues[0].document_tax_ids, ['11111111000111']);
});
