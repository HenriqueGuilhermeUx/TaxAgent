import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalOnboardingAuditService } from '../src/operations/fiscal-onboarding-audit.service';

function databaseCapture() {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  return {
    calls,
    db: {
      query: async (text: string, params: unknown[]) => {
        calls.push({ text, params });
        if (text.startsWith('INSERT')) {
          return { rows: [{ id: params[0], created_at: '2026-09-24T00:00:00.000Z' }] };
        }
        return { rows: [] };
      },
    },
  };
}

test('attestation persists a sanitized immutable snapshot and SHA-256 evidence', async () => {
  const capture = databaseCapture();
  const service = new FiscalOnboardingAuditService(capture.db as any);
  const result = {
    company: { id: 'comp_1', tax_id_masked: '12********0001' },
    environment: 'test' as const,
    status: 'BLOCKED',
    route: { resolved_route: 'municipal-provider', resolved_provider: 'giss' },
    blockers: ['municipal_registration'],
    secrets_exposed: false,
  };

  const attestation = await service.record('comp_1', 'onboarding', result);
  assert.match(attestation.snapshot_sha256, /^[a-f0-9]{64}$/);
  assert.equal(attestation.immutable_evidence, true);
  assert.equal(attestation.secrets_exposed, false);
  const params = capture.calls[0]?.params ?? [];
  assert.equal(params[1], 'comp_1');
  assert.equal(params[3], 'onboarding');
  assert.equal(params[5], 'municipal-provider');
  assert.equal(params[6], 'giss');
  assert.equal(params[9], attestation.snapshot_sha256);
});

test('canonical snapshot hash is stable across object key order', async () => {
  const first = databaseCapture();
  const second = databaseCapture();
  const a = new FiscalOnboardingAuditService(first.db as any);
  const b = new FiscalOnboardingAuditService(second.db as any);

  await a.record('comp_1', 'preflight', {
    environment: 'test', status: 'PREFLIGHT_OK', blockers: [],
    route: { resolved_provider: 'nfse-national', resolved_route: 'national-direct' },
    safeguards: { fiscal_emission_attempted: false, fiscal_transmission_attempted: false },
  });
  await b.record('comp_1', 'preflight', {
    safeguards: { fiscal_transmission_attempted: false, fiscal_emission_attempted: false },
    route: { resolved_route: 'national-direct', resolved_provider: 'nfse-national' },
    blockers: [], status: 'PREFLIGHT_OK', environment: 'test',
  });

  assert.equal(first.calls[0]?.params[9], second.calls[0]?.params[9]);
});

test('audit store refuses secret-bearing fields instead of persisting them', async () => {
  const capture = databaseCapture();
  const service = new FiscalOnboardingAuditService(capture.db as any);
  await assert.rejects(
    () => service.record('comp_1', 'onboarding', {
      environment: 'test', status: 'BLOCKED', blockers: [], password: 'must-not-store',
    }),
    /Refusing to persist secret-bearing onboarding snapshot field/,
  );
  assert.equal(capture.calls.length, 0);
});
