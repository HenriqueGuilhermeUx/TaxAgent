import assert from 'node:assert/strict';
import test from 'node:test';
import { rtcDecisionStatus } from '../src/official-rtc/canonical-rtc.service';

function result(assessment: any) {
  return {
    engine: {
      id: 'regular',
      upstreamRepository: 'ReceitaFederal/calculadora-rtc-regime-regular',
      upstreamCommit: '150cccbe414d4a5edea703e4f7a424af5aa222c7',
      upstreamRelease: '1.6.1',
      license: 'MIT',
    },
    mode: 'shadow',
    input_sha256: 'a'.repeat(64),
    calculated_at: '2026-11-18T00:00:00.000Z',
    assessment,
    result: {},
  };
}

test('RTC calculation decision is resolved only when every item is usable', () => {
  assert.equal(rtcDecisionStatus(result({
    response_valid: true,
    all_items_usable: true,
    authoritative_eligible: false,
    simulation_only: true,
    counts: { simulated: 1 },
  })), 'resolved');
});

test('RTC calculation decision requires input on malformed or unusable results', () => {
  assert.equal(rtcDecisionStatus(result({
    response_valid: false,
    all_items_usable: false,
    counts: {},
  })), 'requires_input');

  assert.equal(rtcDecisionStatus(result({
    response_valid: true,
    all_items_usable: false,
    counts: { input_error: 1 },
  })), 'requires_input');
});

test('RTC calculation decision is unsupported when the official engine reports unsupported items', () => {
  assert.equal(rtcDecisionStatus(result({
    response_valid: true,
    all_items_usable: false,
    counts: { unsupported: 1 },
  })), 'unsupported');
});
