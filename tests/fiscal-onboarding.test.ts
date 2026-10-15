import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalOnboardingService } from '../src/operations/fiscal-onboarding.service';

function service(overrides: {
  company?: Record<string, unknown>;
  route?: Record<string, unknown>;
  certificates?: Array<Record<string, unknown>>;
  gateway?: Record<string, unknown>;
  credentials?: Array<Record<string, unknown>>;
} = {}) {
  const company = overrides.company ?? {
    id: 'comp_1',
    name: 'Empresa Teste',
    tax_id: '12345678000195',
    municipal_registration: '12345',
    city_code: '3530607',
    tax_regime: 'regular',
  };
  const route = overrides.route ?? {
    cityCode: '3530607', environment: 'test', nationalStandard: true, nationalAdnParticipant: true,
    nationalPublicIssuer: true, route: 'national-direct', provider: 'nfse-national',
    source: 'official-national-parameters', sourceUrl: 'https://example.test', evidenceDate: '2026-09-24',
    effectiveFrom: null, confidence: 'high', checkedAt: '2026-09-24T00:00:00.000Z',
  };
  const certificates = overrides.certificates ?? [{
    status: 'active', subject_tax_id: '12345678000195', valid_to: '2030-01-01T00:00:00.000Z',
  }];
  const gateway = overrides.gateway ?? { provider: 'plugnotas', configured: true, covered: false, transmissionEnabled: false };
  const credentials = overrides.credentials ?? [];

  return new FiscalOnboardingService(
    { getCompany: async () => company } as any,
    { metadata: async () => certificates } as any,
    { resolve: async () => route } as any,
    { resolve: async () => gateway } as any,
    { list: async () => credentials } as any,
  );
}

test('national-direct regular company with matching valid A1 is ready for homologation while transmission stays locked', async () => {
  const result = await service().inspect('comp_1', 'test', '2026-09-24');
  assert.equal(result.status, 'READY_FOR_HOMOLOGATION');
  assert.equal(result.route.resolved_route, 'national-direct');
  assert.equal(result.route.resolved_provider, 'nfse-national');
  assert.equal(result.transmission.allowed, false);
  assert.equal(result.transmission.fiscal_emission_attempted, false);
  assert.deepEqual(result.blockers, []);
});

test('Santos GISS company without municipal registration fails with one explicit onboarding blocker', async () => {
  const result = await service({
    company: {
      id: 'comp_santos', name: 'Santos Teste', tax_id: '12345678000195', municipal_registration: null,
      city_code: '3548500', tax_regime: 'regular',
    },
    route: {
      cityCode: '3548500', environment: 'test', nationalStandard: true, nationalAdnParticipant: true,
      nationalPublicIssuer: false, route: 'municipal-provider', provider: 'giss',
      source: 'taxagent-observed-official-rejection', sourceUrl: 'https://example.test', evidenceDate: '2026-09-24',
      effectiveFrom: null, confidence: 'high', checkedAt: '2026-09-24T00:00:00.000Z',
    },
  }).inspect('comp_santos', 'test', '2026-09-24');

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.route.resolved_provider, 'giss');
  assert.ok(result.blockers.includes('municipal_registration'));
  assert.equal(result.transmission.allowed, false);
});

test('gateway route reports provider credentials as pending instead of pretending issuer is ready', async () => {
  const result = await service({
    company: {
      id: 'comp_gateway', name: 'Gateway Teste', tax_id: '12345678000195', municipal_registration: '9988',
      city_code: '3550308', tax_regime: 'regular',
    },
    route: {
      cityCode: '3550308', environment: 'test', nationalStandard: true, nationalAdnParticipant: true,
      nationalPublicIssuer: false, route: 'unknown', provider: 'unknown', source: 'official-national-parameters',
      sourceUrl: 'https://example.test', evidenceDate: '2026-09-24', effectiveFrom: null, confidence: 'medium',
      checkedAt: '2026-09-24T00:00:00.000Z',
    },
    gateway: {
      provider: 'plugnotas', configured: true, covered: true, transmissionEnabled: false,
      municipality: { name: 'São Paulo', state: 'SP', pattern: 'ABRASF' },
      requirements: { certificate: false, login: true, password: true },
    },
    credentials: [{
      provider: 'plugnotas', environment: 'test', credential_keys: ['login', 'senha'], status: 'pending',
    }],
  }).inspect('comp_gateway', 'test', '2026-09-24');

  assert.equal(result.route.resolved_route, 'gateway');
  assert.equal(result.route.resolved_provider, 'plugnotas');
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.includes('provider_credentials'));
});

test('gateway route becomes onboarding-ready only after required credentials are verified', async () => {
  const result = await service({
    company: {
      id: 'comp_gateway', name: 'Gateway Teste', tax_id: '12345678000195', municipal_registration: '9988',
      city_code: '3550308', tax_regime: 'regular',
    },
    route: {
      cityCode: '3550308', environment: 'test', nationalStandard: false, nationalAdnParticipant: false,
      nationalPublicIssuer: false, route: 'unknown', provider: 'unknown', source: 'official-national-parameters',
      sourceUrl: 'https://example.test', evidenceDate: '2026-09-24', effectiveFrom: null, confidence: 'medium',
      checkedAt: '2026-09-24T00:00:00.000Z',
    },
    gateway: {
      provider: 'plugnotas', configured: true, covered: true, transmissionEnabled: false,
      requirements: { certificate: false, login: true, password: true },
    },
    credentials: [{
      provider: 'plugnotas', environment: 'test', credential_keys: ['usuario', 'senha'], status: 'verified',
    }],
  }).inspect('comp_gateway', 'test', '2026-09-24');

  assert.equal(result.status, 'READY_FOR_HOMOLOGATION');
  assert.deepEqual(result.blockers, []);
  assert.equal(result.transmission.allowed, false);
});

test('unknown native route and uncovered gateway fail closed', async () => {
  const result = await service({
    route: {
      cityCode: '3530607', environment: 'test', nationalStandard: false, nationalAdnParticipant: false,
      nationalPublicIssuer: false, route: 'unknown', provider: 'unknown', source: 'official-national-parameters',
      sourceUrl: 'https://example.test', evidenceDate: '2026-09-24', effectiveFrom: null, confidence: 'medium',
      checkedAt: '2026-09-24T00:00:00.000Z',
    },
    gateway: { provider: 'plugnotas', configured: true, covered: false, transmissionEnabled: false, reason: 'municipality_not_listed_by_gateway' },
  }).inspect('comp_1', 'test', '2026-09-24');

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.route.resolved_route, 'unresolved');
  assert.ok(result.blockers.includes('fiscal_route'));
  assert.equal(result.transmission.allowed, false);
});
