import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate2026StandardReference } from '../src/tax-engine/tax-rules';

test('computes only explicit standard-treatment 2026 reference values', () => {
  assert.deepEqual(calculate2026StandardReference(5000, '2026-08-08', 'standard'), {
    kind: '2026-test-reference', referenceOnly: true, base: 5000,
    rates: { ibs: 0.001, cbs: 0.009, total: 0.01 },
    amounts: { ibs: 5, cbs: 45, total: 50 },
  });
});

test('refuses to auto-calculate differentiated/special or non-2026 scenarios', () => {
  assert.equal(calculate2026StandardReference(5000, '2026-08-08', 'special'), null);
  assert.equal(calculate2026StandardReference(5000, '2027-01-01', 'standard'), null);
});
