import assert from 'node:assert/strict';
import test from 'node:test';
import { IssuerReadinessService } from '../src/operations/issuer-readiness.service';

function service(overrides: Record<string, any> = {}) {
  const tenancy = overrides.tenancy ?? { getCompany: async () => ({ id: 'comp_1', tax_id: '12345678000190', city_code: '3530607', tax_regime: 'regular', municipal_registration: '123' }) };
  const certificates = overrides.certificates ?? { metadata: async () => [{ status: 'active', valid_to: '2027-01-01T00:00:00Z', subject_tax_id: '12345678000190' }] };
  const capabilities = overrides.capabilities ?? { resolve: async () => ({ route: 'national-direct', provider: 'nfse-national', nationalPublicIssuer: true, source: 'official-national-parameters' }) };
  const schemas = overrides.schemas ?? {
    dpsConformance: () => ({ verified: true }),
    eventConformance: () => ({ verified: true }),
  };
  return new IssuerReadinessService(tenancy as any, certificates as any, capabilities as any, schemas as any);
}

test('reports a safe national test-issuance ready issuer without exposing CNPJ or certificate material', async () => {
  const result = await service().inspect('comp_1', 'test', '2026-09-24');
  assert.equal(result.eligible_for_national_test_issuance, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.tax_regime, 'regular');
  assert.equal(result.route.resolved_route, 'national-direct');
  assert.equal(result.certificate.company_binding, true);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('12345678000190'), false);
  assert.equal(serialized.includes('private'), true); // safeguard field only
});

test('Santos/municipal route remains explicitly blocked for national test issuance', async () => {
  const result = await service({
    tenancy: { getCompany: async () => ({ id: 'comp_1', tax_id: '12345678000190', city_code: '3548500', tax_regime: 'regular', municipal_registration: null }) },
    capabilities: { resolve: async () => ({ route: 'municipal-provider', provider: 'giss', nationalPublicIssuer: false, source: 'taxagent-observed-official-rejection' }) },
  }).inspect('comp_1', 'test', '2026-09-24');
  assert.equal(result.eligible_for_national_test_issuance, false);
  assert.ok(result.blockers.includes('issuer_route_not_national_direct'));
});

test('unsupported live builder tax regime stays blocked even when route and A1 are otherwise ready', async () => {
  const result = await service({
    tenancy: { getCompany: async () => ({ id: 'comp_1', tax_id: '12345678000190', city_code: '3530607', tax_regime: 'simples_nacional', municipal_registration: '123' }) },
  }).inspect('comp_1', 'test', '2026-11-01');
  assert.equal(result.eligible_for_national_test_issuance, false);
  assert.ok(result.blockers.includes('tax_regime_not_yet_supported_by_live_dps_builder'));
});
