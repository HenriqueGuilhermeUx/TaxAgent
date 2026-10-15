import assert from 'node:assert/strict';
import test from 'node:test';
import { MunicipalityScenarioService } from '../src/operations/municipality-scenario.service';

test('same Company/A1 can inspect a Mogi service-location scenario without changing Santos issuer route', async () => {
  const calls: string[] = [];
  const service = new MunicipalityScenarioService(
    { getCompany: async () => ({ id: 'comp_1', tax_id: '12345678000190', city_code: '3548500', tax_regime: 'regular' }) } as any,
    { metadata: async () => [{ status: 'active', certificate_fingerprint: 'fp_same_a1', subject_tax_id: '12345678000190', valid_to: '2027-09-21T15:41:00.000Z' }] } as any,
    { resolve: async (cityCode: string) => {
      calls.push(cityCode);
      return cityCode === '3548500'
        ? { cityCode, route: 'municipal-provider', provider: 'giss', nationalStandard: true, nationalPublicIssuer: false }
        : { cityCode, route: 'unknown', provider: 'unknown', nationalStandard: true, nationalPublicIssuer: false };
    } } as any,
    { getConvention: async () => ({ supported: true, status: 200, payload: { convenio: true } }) } as any,
  );

  const result = await service.inspect('comp_1', 'test', '3530607', '2026-09-23');

  assert.equal(result.certificate?.reused_for_same_company, true);
  assert.equal(result.certificate?.fingerprint, 'fp_same_a1');
  assert.equal(result.issuer_city_code, '3548500');
  assert.equal(result.service_location_city_code, '3530607');
  assert.equal(result.issuer_route.route, 'municipal-provider');
  assert.equal(result.issuer_route.provider, 'giss');
  assert.equal(result.safeguards.issuer_override_applied, false);
  assert.equal(result.safeguards.fiscal_transmission_attempted, false);
  assert.deepEqual(calls, ['3548500', '3530607']);
});

test('same Santos A1 probes Mogi national parameters with GET only and never changes issuer', async () => {
  const material = { fingerprint: 'fp_same_a1', tlsCertificatePem: 'CERT', tlsPrivateKeyPem: 'KEY' };
  let probeCity = '';
  let probeCertificate: unknown;
  const service = new MunicipalityScenarioService(
    { getCompany: async () => ({ id: 'comp_1', tax_id: '12345678000190', city_code: '3548500', tax_regime: 'regular' }) } as any,
    {
      metadata: async () => [{ status: 'active', certificate_fingerprint: 'fp_same_a1', subject_tax_id: '12345678000190' }],
      getActiveMaterial: async () => material,
    } as any,
    { resolve: async (cityCode: string) => cityCode === '3548500'
      ? { cityCode, route: 'municipal-provider', provider: 'giss', nationalStandard: true, nationalPublicIssuer: false }
      : { cityCode, route: 'unknown', provider: 'unknown', nationalStandard: true, nationalPublicIssuer: false } } as any,
    { getConvention: async (_environment: string, cityCode: string, certificate: unknown) => {
      probeCity = cityCode;
      probeCertificate = certificate;
      return { supported: true, status: 200, payload: { convenio: true } };
    } } as any,
  );

  const result = await service.probeServiceMunicipality('comp_1', 'test', '3530607', '2026-09-23');
  assert.equal(probeCity, '3530607');
  assert.equal(probeCertificate, material);
  assert.equal(result.issuer_city_code, '3548500');
  assert.equal(result.service_location_city_code, '3530607');
  assert.equal(result.a1_probe.http_status, 200);
  assert.equal(result.a1_probe.same_company_certificate_reused, true);
  assert.equal(result.safeguards.network_method, 'GET');
  assert.equal(result.safeguards.fiscal_transmission_attempted, false);
  assert.equal(result.safeguards.issuer_override_applied, false);
});
