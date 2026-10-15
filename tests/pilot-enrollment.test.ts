import assert from 'node:assert/strict';
import test from 'node:test';
import { PilotEnrollmentService } from '../src/operations/pilot-enrollment.service';

function onboardingResult(status: 'BLOCKED' | 'READY_FOR_HOMOLOGATION' = 'BLOCKED') {
  return {
    environment: 'test',
    status,
    route: { resolved_route: 'municipal-provider', resolved_provider: 'giss' },
    requirements: [
      { id: 'municipal_registration', label: 'Inscrição Municipal', required: true, satisfied: false, source: 'giss-onboarding' },
      { id: 'active_a1', label: 'Certificado A1 ativo', required: true, satisfied: false, source: 'certificate-vault' },
    ],
    blockers: status === 'BLOCKED' ? ['municipal_registration', 'active_a1'] : [],
    next_actions: status === 'BLOCKED' ? [
      { requirement: 'municipal_registration', action: 'Cadastrar a Inscrição Municipal real da empresa.' },
      { requirement: 'active_a1', action: 'Enviar um certificado A1 válido pertencente ao mesmo CNPJ da empresa.' },
    ] : [],
  };
}

test('new pilot creates company once, persists enrollment and produces checklist without preflight', async () => {
  const calls: string[] = [];
  const db = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql.includes('SELECT id FROM companies')) return { rows: [] };
      if (sql.includes('INSERT INTO pilot_enrollments')) return { rows: [{
        id: 'pilot_1', company_id: 'comp_1', environment: 'test', label: 'Santos', source: 'partner', status: 'active',
        enrolled_at: '2026-09-25T10:00:00Z', updated_at: '2026-09-25T10:00:00Z', created: true,
      }] };
      throw new Error(`unexpected query: ${sql}`);
    },
  } as any;
  const tenancy = {
    createOrganization: async () => ({ id: 'org_1' }),
    createCompany: async () => ({ id: 'comp_1', organization_id: 'org_1', name: 'Piloto', tax_id: '12345678000190', city_code: '3548500', municipal_registration: null, tax_regime: 'regular' }),
    getCompany: async () => { throw new Error('not expected'); },
  } as any;
  let inspectCount = 0;
  const onboarding = { inspect: async () => { inspectCount += 1; return onboardingResult('BLOCKED'); } } as any;
  const audit = { record: async () => ({ id: 'att_1', immutable_evidence: true }) } as any;
  const service = new PilotEnrollmentService(db, tenancy, onboarding, audit);

  const result = await service.enroll({
    organization_name: 'Org Piloto', company_name: 'Piloto', tax_id: '12.345.678/0001-90', city_code: '3548500',
    tax_regime: 'regular', pilot_label: 'Santos', source: 'partner',
  }, 'test', '2026-09-25');

  assert.equal(result.company.created_during_enrollment, true);
  assert.equal(result.company.tax_id_masked, '12********0190');
  assert.equal(result.pilot_status, 'ACTION_REQUIRED');
  assert.equal(result.checklist.length, 2);
  assert.equal(result.safeguards.preflight_attempted, false);
  assert.equal(result.safeguards.fiscal_transmission_attempted, false);
  assert.equal(inspectCount, 1);
  assert.ok(calls.some((sql) => sql.includes('pilot_enrollments')));
});

test('existing company enrollment is idempotent and does not create a second company', async () => {
  let createCompanyCalled = false;
  const db = {
    query: async (sql: string) => {
      if (sql.includes('INSERT INTO pilot_enrollments')) return { rows: [{
        id: 'pilot_existing', company_id: 'comp_existing', environment: 'test', label: null, source: null, status: 'active',
        enrolled_at: '2026-09-25T10:00:00Z', updated_at: '2026-09-25T11:00:00Z', created: false,
      }] };
      throw new Error(`unexpected query: ${sql}`);
    },
  } as any;
  const tenancy = {
    getCompany: async () => ({ id: 'comp_existing', organization_id: 'org_1', name: 'Existente', tax_id: '12345678000190', city_code: '3550308', municipal_registration: '1', tax_regime: 'regular' }),
    createCompany: async () => { createCompanyCalled = true; throw new Error('not expected'); },
  } as any;
  const onboarding = { inspect: async () => onboardingResult('READY_FOR_HOMOLOGATION') } as any;
  const audit = { record: async () => ({ id: 'att_2' }) } as any;
  const service = new PilotEnrollmentService(db, tenancy, onboarding, audit);

  const result = await service.enroll({ company_id: 'comp_existing' }, 'test', '2026-09-25');
  assert.equal(createCompanyCalled, false);
  assert.equal(result.enrollment.created, false);
  assert.equal(result.pilot_status, 'READY_FOR_PREFLIGHT');
  assert.equal(result.safeguards.preflight_attempted, false);
});
