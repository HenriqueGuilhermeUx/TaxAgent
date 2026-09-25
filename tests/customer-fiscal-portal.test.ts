import assert from 'node:assert/strict';
import test from 'node:test';
import { CustomerFiscalService } from '../src/customer-portal/customer-fiscal.service';
import { customerHomeHtml, customerPortalHtml } from '../src/customer-portal/customer-portal.page';

function blockedJourney() {
  return {
    company: { id: 'comp_1', name: 'Empresa', city_code: '3548500', tax_regime: 'regular' },
    environment: 'test',
    pilot_status: 'ACTION_REQUIRED',
    onboarding_status: 'BLOCKED',
    route: { resolved_route: 'municipal-provider', resolved_provider: 'giss' },
    stages: [
      { id: 'municipal_registration', label: 'Inscrição Municipal', status: 'ACTION_REQUIRED', action: { authorization: 'bootstrap-token' } },
      { id: 'a1_certificate', label: 'Certificado A1', status: 'ACTION_REQUIRED' },
    ],
    blockers: ['municipal_registration', 'active_a1'],
    next_action: { action: 'Cadastrar IM real' },
    evidence: { latest_onboarding: null, latest_preflight: null },
  } as any;
}

test('customer fiscal surface replaces bootstrap actions with company-scoped safe channels', async () => {
  const service = new CustomerFiscalService(
    { updateCompany: async () => { throw new Error('not expected'); } } as any,
    { status: async () => blockedJourney() } as any,
  );
  const result = await service.status('comp_1', 'test', '2026-09-25');
  assert.equal(result.fiscal_status, 'ACTION_REQUIRED');
  assert.equal(result.safeguards.bootstrap_token_required_by_customer, false);
  assert.equal(result.safeguards.fiscal_transmission_attempted, false);
  assert.equal((result.stages[0]?.action as any)?.path, '/v1/portal/companies/comp_1/fiscal/profile');
  assert.equal((result.stages[0]?.action as any)?.authorization, 'company-api-key');
  assert.equal((result.stages[1]?.action as any)?.handled_by, 'certificate-vault');
});

test('customer profile update persists only non-secret fiscal fields and safely advances', async () => {
  let patch: Record<string, unknown> | null = null;
  let runs = 0;
  const ready = { ...blockedJourney(), pilot_status: 'HOMOLOGATION_READY', onboarding_status: 'READY_FOR_HOMOLOGATION', blockers: [] } as any;
  const service = new CustomerFiscalService(
    { updateCompany: async (_id: string, dto: Record<string, unknown>) => { patch = dto; } } as any,
    { run: async () => { runs += 1; return ready; } } as any,
  );
  const result = await service.updateProfile('comp_1', 'test', { municipal_registration: ' 123456 ', tax_regime: ' regular ' }, '2026-09-25');
  assert.deepEqual(patch, { municipal_registration: '123456', tax_regime: 'regular' });
  assert.equal(runs, 1);
  assert.equal(result.ready_for_authorized_homologation_test, true);
  assert.equal(result.safeguards.fiscal_emission_attempted, false);
});

test('customer portal is product-facing and keeps credentials memory-only', () => {
  const home = customerHomeHtml();
  const portal = customerPortalHtml();
  assert.match(home, /Fiscal sem integração infinita/i);
  assert.match(home, /Configurar minha empresa/i);
  assert.doesNotMatch(portal, /X-TaxAgent-Bootstrap-Token/i);
  assert.doesNotMatch(portal, /localStorage\.setItem|sessionStorage\.setItem/i);
  assert.match(portal, /certificates\/upload/);
  assert.match(portal, /provider-credentials/);
  assert.match(portal, /fiscal\/advance/);
  assert.match(portal, /nunca habilita transmissão fiscal automaticamente/i);
});
