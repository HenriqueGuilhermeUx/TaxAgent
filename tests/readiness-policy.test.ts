import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadinessGate, summarizeReadiness } from '../src/operations/readiness.types';

const gate = (id: string, status: 'pass' | 'fail', blocking = true): ReadinessGate => ({ id, status, blocking, label: id, detail: id });

test('preflight can be ready before live switches are enabled', () => {
  const summary = summarizeReadiness([
    gate('certificate_a1', 'pass'),
    gate('certificate_company_binding', 'pass'),
    gate('official_schema', 'pass'),
    gate('dps_builder_verified', 'pass'),
    gate('nfse_endpoint', 'pass'),
    gate('nfse_mode_live', 'fail'),
    gate('live_enabled', 'fail'),
  ]);
  assert.equal(summary.readyToEnableLive, true);
  assert.equal(summary.readyForTransmission, false);
  assert.equal(summary.readyWithoutCertificate, true);
});

test('a missing certificate blocks live readiness but not pre-certificate readiness', () => {
  const summary = summarizeReadiness([
    gate('certificate_a1', 'fail'),
    gate('certificate_company_binding', 'fail'),
    gate('official_schema', 'pass'),
    gate('dps_builder_verified', 'pass'),
    gate('nfse_endpoint', 'pass'),
    gate('nfse_mode_live', 'fail'),
    gate('live_enabled', 'fail'),
  ]);
  assert.equal(summary.readyToEnableLive, false);
  assert.equal(summary.readyForTransmission, false);
  assert.equal(summary.readyWithoutCertificate, true);
  assert.deepEqual(summary.remainingCertificateGates, ['certificate_a1', 'certificate_company_binding']);
  assert.deepEqual(summary.failedBlockingGatesBeforeCertificate, []);
});

test('pre-certificate readiness still fails when a non-certificate safety gate fails', () => {
  const summary = summarizeReadiness([
    gate('certificate_a1', 'fail'),
    gate('certificate_company_binding', 'fail'),
    gate('official_schema', 'fail'),
    gate('dps_builder_verified', 'pass'),
    gate('nfse_endpoint', 'pass'),
    gate('nfse_mode_live', 'fail'),
    gate('live_enabled', 'fail'),
  ]);
  assert.equal(summary.readyWithoutCertificate, false);
  assert.deepEqual(summary.failedBlockingGatesBeforeCertificate, ['official_schema']);
});

test('a missing certificate remains visible in the complete blocking-gate list', () => {
  const summary = summarizeReadiness([
    gate('certificate_a1', 'fail'),
    gate('nfse_mode_live', 'fail'),
    gate('live_enabled', 'fail'),
  ]);
  assert.equal(summary.readyToEnableLive, false);
  assert.deepEqual(summary.failedBlockingGates, ['certificate_a1', 'nfse_mode_live', 'live_enabled']);
});
