import assert from 'node:assert/strict';
import test from 'node:test';
import { PilotOnboardingService } from '../src/operations/pilot-onboarding.service';

function onboarding(status: 'READY_FOR_HOMOLOGATION' | 'BLOCKED' = 'READY_FOR_HOMOLOGATION') {
  return {
    company: { id: 'comp_1', name: 'Pilot Co', city_code: '3548500', tax_regime: 'regular' },
    environment: 'test',
    effective_at: '2026-09-25',
    status,
    route: { resolved_route: 'municipal-provider', resolved_provider: 'giss' },
    requirements: status === 'BLOCKED'
      ? [{ id: 'municipal_registration', label: 'Inscrição Municipal', required: true, satisfied: false, source: 'giss-onboarding' }]
      : [
          { id: 'municipal_registration', label: 'Inscrição Municipal', required: true, satisfied: true, source: 'giss-onboarding' },
          { id: 'active_a1', label: 'A1', required: true, satisfied: true, source: 'certificate-vault' },
          { id: 'valid_a1', label: 'A1 válido', required: true, satisfied: true, source: 'certificate-vault' },
          { id: 'certificate_company_binding', label: 'A1/CNPJ', required: true, satisfied: true, source: 'certificate-vault' },
        ],
    blockers: status === 'BLOCKED' ? ['municipal_registration'] : [],
    next_actions: status === 'BLOCKED' ? [{ requirement: 'municipal_registration', action: 'Cadastrar a IM real.' }] : [],
    transmission: { allowed: false },
  };
}

function fakeAudit() {
  const rows: any[] = [];
  return {
    rows,
    record: async (_companyId: string, type: 'onboarding' | 'preflight', result: any) => {
      const row = {
        id: `att_${rows.length + 1}`,
        environment: result.environment,
        assessment_type: type,
        status: result.status,
        route: result.route?.resolved_route ?? null,
        provider: result.route?.resolved_provider ?? null,
        blockers: result.blockers ?? [],
        snapshot_sha256: String(rows.length + 1).padStart(64, '0'),
        created_at: new Date(Date.now() + rows.length).toISOString(),
      };
      rows.unshift(row);
      return { ...row, company_id: _companyId, immutable_evidence: true, secrets_exposed: false };
    },
    list: async () => rows,
  };
}

test('blocked pilot run persists assessment and stops before provider preflight', async () => {
  const audit = fakeAudit();
  let preflightCalled = false;
  const service = new PilotOnboardingService(
    { inspect: async () => onboarding('BLOCKED') } as any,
    { run: async () => { preflightCalled = true; return {}; } } as any,
    audit as any,
  );

  const result = await service.run('comp_1', 'test', '2026-09-25');
  assert.equal(result.pilot_status, 'ACTION_REQUIRED');
  assert.equal(preflightCalled, false);
  assert.equal(result.run.preflight_executed, false);
  assert.equal(result.run.stopped_before_provider_network, true);
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].assessment_type, 'onboarding');
  assert.equal(result.transmission.allowed, false);
});

test('ready pilot run performs safe preflight and persists both attestations', async () => {
  const audit = fakeAudit();
  let preflightCalled = false;
  const service = new PilotOnboardingService(
    { inspect: async () => onboarding('READY_FOR_HOMOLOGATION') } as any,
    { run: async () => {
      preflightCalled = true;
      return {
        company_id: 'comp_1',
        environment: 'test',
        status: 'PREFLIGHT_OK',
        route: { resolved_route: 'municipal-provider', resolved_provider: 'giss' },
        blockers: [],
        safeguards: { fiscal_post_attempted: false, fiscal_transmission_attempted: false, fiscal_emission_attempted: false },
      };
    } } as any,
    audit as any,
  );

  const result = await service.run('comp_1', 'test', '2026-09-25');
  assert.equal(preflightCalled, true);
  assert.equal(result.pilot_status, 'HOMOLOGATION_READY');
  assert.equal(result.run.preflight_executed, true);
  assert.equal(audit.rows.length, 2);
  assert.deepEqual(audit.rows.map((row) => row.assessment_type), ['preflight', 'onboarding']);
  assert.equal(result.transmission.allowed, false);
  assert.equal(result.transmission.fiscal_emission_attempted, false);
});

test('pilot status treats evidence from another route as stale and requires a fresh assessment', async () => {
  const audit = fakeAudit();
  audit.rows.push({
    id: 'att_old',
    environment: 'test',
    assessment_type: 'onboarding',
    status: 'READY_FOR_HOMOLOGATION',
    route: 'gateway',
    provider: 'plugnotas',
    blockers: [],
    snapshot_sha256: 'a'.repeat(64),
    created_at: '2026-09-24T12:00:00.000Z',
  });
  const service = new PilotOnboardingService(
    { inspect: async () => onboarding('READY_FOR_HOMOLOGATION') } as any,
    { run: async () => ({}) } as any,
    audit as any,
  );

  const result = await service.status('comp_1', 'test', '2026-09-25');
  assert.equal(result.pilot_status, 'READY_FOR_ASSESSMENT');
  const stage = result.stages.find((item: any) => item.id === 'onboarding_attestation');
  assert.equal(stage.status, 'STALE');
});
