import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { PilotIntakeService } from '../src/operations/pilot-intake.service';

function enrollment(status: 'active' | 'paused' | 'completed' = 'active') {
  return {
    id: 'pilot_1',
    company_id: 'comp_1',
    environment: 'test',
    label: 'Piloto Santos',
    source: 'partner',
    status,
    enrolled_at: '2026-09-25T10:00:00Z',
    updated_at: '2026-09-25T10:00:00Z',
    company: { id: 'comp_1', name: 'Empresa Piloto', tax_id_masked: '12********0190', city_code: '3548500' },
    transmission: { allowed: false, fiscal_transmission_attempted: false, fiscal_emission_attempted: false },
  } as any;
}

function blockedJourney() {
  return {
    company: { id: 'comp_1', name: 'Empresa Piloto', city_code: '3548500', tax_regime: 'regular' },
    environment: 'test',
    pilot_status: 'ACTION_REQUIRED',
    onboarding_status: 'BLOCKED',
    route: { resolved_route: 'municipal-provider', resolved_provider: 'giss' },
    stages: [
      { id: 'municipal_registration', label: 'Inscrição Municipal', status: 'ACTION_REQUIRED' },
      { id: 'a1_certificate', label: 'Certificado A1', status: 'ACTION_REQUIRED' },
    ],
    blockers: ['municipal_registration', 'active_a1'],
    next_action: { requirement: 'municipal_registration', action: 'Cadastrar IM real' },
    evidence: { latest_onboarding: null, latest_preflight: null },
    transmission: { allowed: false },
  } as any;
}

test('secure intake maps blockers to existing safe channels without exposing secrets', async () => {
  const service = new PilotIntakeService(
    { get: async () => enrollment() } as any,
    { updateCompany: async () => { throw new Error('not expected'); } } as any,
    { status: async () => blockedJourney() } as any,
  );

  const result = await service.status('comp_1', 'test', '2026-09-25');
  assert.equal(result.pilot_status, 'ACTION_REQUIRED');
  assert.equal(result.safeguards.intake_endpoints_accept_secrets, false);
  assert.equal(result.safeguards.fiscal_transmission_attempted, false);
  assert.equal(result.secure_channels.a1_certificate.required_scope, 'certificates:write');
  assert.equal(result.secure_channels.a1_certificate.handled_by, 'certificate-vault');
  assert.equal(result.secure_channels.provider_credentials.handled_by, 'encrypted-provider-credentials');
  assert.match(result.secure_channels.provider_credentials.verification, /never self-verifies/i);
  assert.equal((result.stages[0]?.intake_channel as any)?.path, '/v1/operations/pilots/comp_1/intake/profile');
  assert.equal((result.stages[1]?.intake_channel as any)?.path, '/v1/companies/comp_1/certificates/upload');
});

test('profile correction reassesses and can promote a fully ready pilot through safe preflight', async () => {
  let patch: Record<string, unknown> | null = null;
  let runCount = 0;
  const readyJourney = {
    ...blockedJourney(),
    pilot_status: 'HOMOLOGATION_READY',
    onboarding_status: 'READY_FOR_HOMOLOGATION',
    blockers: [],
    run: {
      preflight_executed: true,
      stopped_before_provider_network: false,
      onboarding_attestation: { id: 'att_1' },
      preflight_attestation: { id: 'att_2' },
    },
  } as any;

  const service = new PilotIntakeService(
    { get: async () => enrollment() } as any,
    { updateCompany: async (_id: string, dto: Record<string, unknown>) => { patch = dto; return { id: 'comp_1', ...dto }; } } as any,
    { run: async () => { runCount += 1; return readyJourney; } } as any,
  );

  const result = await service.updateProfile('comp_1', 'test', {
    municipal_registration: ' 123456 ',
    tax_regime: ' regular ',
  }, '2026-09-25');

  assert.deepEqual(patch, { municipal_registration: '123456', tax_regime: 'regular' });
  assert.equal(runCount, 1);
  assert.equal(result.ready_for_authorized_homologation_test, true);
  assert.equal(result.operation.profile_updated, true);
  assert.equal(result.operation.orchestrator_advanced, true);
  assert.equal(result.safeguards.fiscal_emission_attempted, false);
});

test('paused or completed enrollment blocks intake before company mutation or provider activity', async () => {
  let mutated = false;
  let advanced = false;
  const service = new PilotIntakeService(
    { get: async () => enrollment('paused') } as any,
    { updateCompany: async () => { mutated = true; } } as any,
    { run: async () => { advanced = true; return blockedJourney(); } } as any,
  );

  await assert.rejects(
    () => service.updateProfile('comp_1', 'test', { municipal_registration: '123' }, '2026-09-25'),
    (error: unknown) => error instanceof BadRequestException && /active enrollment/.test(error.message),
  );
  assert.equal(mutated, false);
  assert.equal(advanced, false);
});
