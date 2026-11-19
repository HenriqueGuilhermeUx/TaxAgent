import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { PublicRtc2026SimulatorService } from '../src/public-simulator/public-rtc-2026-simulator.service';

const simulator = new PublicRtc2026SimulatorService();

test('public simulator returns the centralized 2026 standard reference without PII/persistence authority', () => {
  const result = simulator.simulate({
    amount: 10000,
    effective_date: '2026-11-19',
    tax_treatment: 'standard',
  });

  assert.equal(result.status, 'reference_calculated');
  assert.equal(result.authoritative, false);
  assert.equal(result.reference_only, true);
  assert.equal(result.calculation?.amounts.ibs, 10);
  assert.equal(result.calculation?.amounts.cbs, 90);
  assert.equal(result.calculation?.amounts.total, 100);
  assert.equal(result.policy.no_pii_collected, true);
  assert.equal(result.policy.no_persistence, true);
  assert.equal(result.policy.no_financial_action, true);
});

test('public simulator fails closed for non-standard treatment instead of inventing rates', () => {
  const result = simulator.simulate({
    amount: 10000,
    effective_date: '2026-11-19',
    tax_treatment: 'special',
  });

  assert.equal(result.status, 'review_required');
  assert.equal(result.calculation, null);
  assert.equal(result.reason, 'non_standard_treatment_requires_verified_official_rules');
  assert.equal(result.authoritative, false);
});

test('public simulator refuses dates outside 2026 while official 2027 freshness is unresolved', () => {
  assert.throws(() => simulator.simulate({
    amount: 10000,
    effective_date: '2027-01-01',
    tax_treatment: 'standard',
  }), BadRequestException);
});
