import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadinessGate, summarizeReadiness } from '../src/operations/readiness.types';

const gate = (id: string, status: 'pass' | 'fail', blocking = true): ReadinessGate => ({ id, status, blocking, label: id, detail: id });

test('preflight can be ready before live switches are enabled', () => {
  const summary = summarizeReadiness([
    gate('certificate_a1', 'pass'),
    gate('official_schema', 'pass'),
    gate('dps_builder_verified', 'pass'),
    gate('nfse_endpoint', 'pass'),
    gate('nfse_mode_live', 'fail'),
    gate('live_enabled', 'fail'),
  ]);
  assert.equal(summary.readyToEnableLive, true);
  assert.equal(summary.readyForTransmission, false);
});

test('a missing certificate blocks even pre-activation readiness', () => {
  const summary = summarizeReadiness([
    gate('certificate_a1', 'fail'),
    gate('nfse_mode_live', 'fail'),
    gate('live_enabled', 'fail'),
  ]);
  assert.equal(summary.readyToEnableLive, false);
  assert.deepEqual(summary.failedBlockingGates, ['certificate_a1', 'nfse_mode_live', 'live_enabled']);
});
