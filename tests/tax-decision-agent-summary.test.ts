import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { buildAgentSafeFiscalSummary } from '../src/tax-engine/tax-decision-agent-summary.service';

function decision(overrides: Record<string, unknown> = {}) {
  return {
    id: 'taxdec_1',
    effective_at: '2026-11-19',
    status: 'resolved',
    decision_kind: 'rtc_calculation' as const,
    output: {
      status: 'resolved',
      decision_kind: 'rtc_calculation',
      regime: 'regular',
      environment: 'test',
      authoritative: false,
      reference_only: true,
      assessment: {
        all_items_usable: true,
        authoritative_eligible: false,
        simulation_only: true,
        counts: { simulated: 1, input_error: 0 },
      },
      freshness: {
        regular: {
          status: 'reference_ahead',
          authoritative_eligible: false,
          reference: { app: '1.7.1-2beedf45', database: 'V0073' },
        },
      },
      engine: {
        id: 'regular',
        upstreamRelease: '1.6.1',
        upstreamCommit: '150cccbe414d4a5edea703e4f7a424af5aa222c7',
      },
      calculation: { secret_raw_payload: 'must not leak' },
      ...((overrides.output as Record<string, unknown> | undefined) ?? {}),
    },
    ...overrides,
  } as any;
}

test('agent-safe summary exposes bounded reference state but never raw calculation payload', () => {
  const summary = buildAgentSafeFiscalSummary(decision());
  assert.equal(summary.use, 'reference_only');
  assert.equal(summary.authoritative, false);
  assert.equal(summary.reference_only, true);
  assert.equal(summary.freshness?.status, 'reference_ahead');
  assert.equal(summary.engine?.release, '1.6.1');
  assert.equal(summary.policy.financial_action_allowed, false);
  assert.equal(summary.policy.issuance_binding_allowed, false);
  assert.equal(summary.policy.raw_fiscal_payload_exposed, false);
  assert.equal('calculation' in summary, false);
  assert.equal(JSON.stringify(summary).includes('secret_raw_payload'), false);
});

test('agent-safe summary routes requires_input and unsupported decisions to review', () => {
  const requiresInput = buildAgentSafeFiscalSummary(decision({ status: 'requires_input' }));
  assert.equal(requiresInput.use, 'review_required');
  assert.equal(requiresInput.next_action, 'collect_or_correct_fiscal_inputs');

  const unsupported = buildAgentSafeFiscalSummary(decision({ status: 'unsupported' }));
  assert.equal(unsupported.use, 'review_required');
  assert.equal(unsupported.next_action, 'route_to_manual_fiscal_review');
});

test('agent-safe summary marks authoritative result as calculation-only, never execution authority', () => {
  const summary = buildAgentSafeFiscalSummary(decision({
    output: {
      regime: 'regular',
      environment: 'test',
      authoritative: true,
      reference_only: false,
      assessment: { all_items_usable: true, authoritative_eligible: true, simulation_only: false, counts: { calculated: 1 } },
      freshness: { regular: { status: 'match', authoritative_eligible: true, reference: { app: '1.6.1' } } },
      engine: { id: 'regular', upstreamRelease: '1.6.1', upstreamCommit: '150cccbe414d4a5edea703e4f7a424af5aa222c7' },
    },
  }));
  assert.equal(summary.use, 'authoritative_calculation_only');
  assert.equal(summary.authoritative, true);
  assert.equal(summary.reference_only, false);
  assert.equal(summary.next_action, 'explain_calculation_only_no_execution');
  assert.equal(summary.policy.financial_action_allowed, false);
  assert.equal(summary.policy.issuance_binding_allowed, false);
});

test('agent-safe summary refuses issuance decisions', () => {
  assert.throws(() => buildAgentSafeFiscalSummary({
    id: 'taxdec_issuance',
    effective_at: '2026-11-19',
    status: 'resolved',
    decision_kind: 'issuance',
    output: {},
  }), BadRequestException);
});
