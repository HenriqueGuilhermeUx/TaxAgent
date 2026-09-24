import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalOnboardingPreflightService } from '../src/operations/fiscal-onboarding-preflight.service';

function ready(route: 'national-direct' | 'municipal-provider' | 'gateway', provider: string) {
  return {
    company: { id: 'comp_1', city_code: route === 'municipal-provider' ? '3548500' : '3530607' },
    environment: 'test',
    status: 'READY_FOR_HOMOLOGATION',
    route: { resolved_route: route, resolved_provider: provider },
    gateway: route === 'gateway' ? { covered: true } : null,
    blockers: [],
  };
}

test('blocked onboarding never opens provider preflight network access', async () => {
  let nationalCalled = false;
  let gissCalled = false;
  const service = new FiscalOnboardingPreflightService(
    { inspect: async () => ({ ...ready('national-direct', 'nfse-national'), status: 'BLOCKED', blockers: ['active_a1'] }) } as any,
    { probe: async () => { nationalCalled = true; } } as any,
    { inspect: async () => { gissCalled = true; } } as any,
  );

  const result = await service.run('comp_1', 'test', '2026-09-24');
  assert.equal(result.status, 'PREFLIGHT_BLOCKED');
  assert.equal(nationalCalled, false);
  assert.equal(gissCalled, false);
  assert.equal(result.safeguards.fiscal_transmission_attempted, false);
});

test('national-direct preflight is OK only with authorized mTLS and municipality parameters', async () => {
  const service = new FiscalOnboardingPreflightService(
    { inspect: async () => ready('national-direct', 'nfse-national') } as any,
    { probe: async () => ({
      mtls: { authorized: true, protocol: 'TLSv1.3' },
      national_endpoint: { official: true },
      municipality_parameters: { http_status: 200, municipality_present: true },
    }) } as any,
    { inspect: async () => ({}) } as any,
  );

  const result = await service.run('comp_1', 'test', '2026-09-24');
  assert.equal(result.status, 'PREFLIGHT_OK');
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.safeguards.network_methods, ['TLS_HANDSHAKE', 'GET']);
  assert.equal(result.safeguards.fiscal_post_attempted, false);
});

test('GISS preflight validates WSDL emission transport without fiscal POST', async () => {
  const service = new FiscalOnboardingPreflightService(
    { inspect: async () => ready('municipal-provider', 'giss') } as any,
    { probe: async () => ({}) } as any,
    { inspect: async () => ({
      reachable: true,
      is_wsdl: true,
      emission_transport: {
        transport_present: true,
        shape_present: true,
        wrapper_mapping_verified: true,
        soap_version: '1.1',
        request_wrapper: 'RecepcionarLoteRpsRequest',
      },
    }) } as any,
  );

  const result = await service.run('comp_1', 'test', '2026-09-24');
  assert.equal(result.status, 'PREFLIGHT_OK');
  assert.deepEqual(result.safeguards.network_methods, ['GET']);
  assert.equal(result.safeguards.fiscal_emission_attempted, false);
});

test('gateway onboarding stays partial until a trustworthy non-emitting issuer-auth probe exists', async () => {
  const service = new FiscalOnboardingPreflightService(
    { inspect: async () => ready('gateway', 'plugnotas') } as any,
    { probe: async () => ({}) } as any,
    { inspect: async () => ({}) } as any,
  );

  const result = await service.run('comp_1', 'test', '2026-09-24');
  assert.equal(result.status, 'PREFLIGHT_PARTIAL');
  assert.ok(result.blockers.includes('gateway_issuer_auth_preflight_not_implemented'));
  assert.equal(result.safeguards.fiscal_post_attempted, false);
});
