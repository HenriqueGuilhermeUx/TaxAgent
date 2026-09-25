import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { NationalPreflightService } from '../src/operations/national-preflight.service';

function service(overrides: Record<string, any> = {}) {
  const calls = { tls: 0, parameters: 0 };
  const deps = {
    tenancy: { getCompany: async () => ({ tax_id: '12345678000190', city_code: '3548500' }) },
    vault: { getActiveMaterial: async () => ({ subjectTaxId: '12345678000190', fingerprint: 'fp' }) },
    nfse: { probeMutualTls: async () => { calls.tls += 1; return { host: 'sefin.producaorestrita.nfse.gov.br', protocol: 'TLSv1.2', cipher: 'cipher', authorized: true }; } },
    parameters: { getConvention: async () => { calls.parameters += 1; return { status: 200, supported: true, payload: {} }; } },
    ...overrides,
  };
  return {
    instance: new NationalPreflightService(deps.tenancy as any, deps.vault as any, deps.nfse as any, deps.parameters as any),
    calls,
  };
}

test('national preflight is test-only', async () => {
  const { instance } = service();
  await assert.rejects(instance.probe('comp_1', 'production', '3530607'), BadRequestException);
});

test('national preflight refuses certificate/company mismatch before network access', async () => {
  const { instance, calls } = service({
    vault: { getActiveMaterial: async () => ({ subjectTaxId: '99999999000199', fingerprint: 'fp' }) },
  });
  await assert.rejects(
    instance.probe('comp_1', 'test', '3530607'),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      const response = error.getResponse() as Record<string, unknown>;
      assert.equal(response.code, 'TA_NATIONAL_CERTIFICATE_COMPANY_MISMATCH');
      assert.equal(response.network_attempted, false);
      return true;
    },
  );
  assert.equal(calls.tls, 0);
  assert.equal(calls.parameters, 0);
});

test('national preflight reuses Company A1 for SEFIN mTLS and target municipality parameters without fiscal transmission', async () => {
  const previous = process.env.NFSE_TEST_BASE_URL;
  process.env.NFSE_TEST_BASE_URL = 'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional';
  try {
    const { instance, calls } = service();
    const result = await instance.probe('comp_1', 'test', '3530607');
    assert.equal(result.issuer_city_code, '3548500');
    assert.equal(result.target_city_code, '3530607');
    assert.equal(result.certificate_company_binding, true);
    assert.equal(result.mtls.authorized, true);
    assert.equal(result.municipality_parameters.http_status, 200);
    assert.equal(result.municipality_parameters.municipality_present, true);
    assert.equal(result.safeguards.issuer_override_applied, false);
    assert.equal(result.safeguards.target_city_used_as_issuer, false);
    assert.equal(result.safeguards.dps_built, false);
    assert.equal(result.safeguards.fiscal_transmission_attempted, false);
    assert.equal(result.safeguards.fiscal_emission_attempted, false);
    assert.equal(calls.tls, 1);
    assert.equal(calls.parameters, 1);
  } finally {
    if (previous === undefined) delete process.env.NFSE_TEST_BASE_URL;
    else process.env.NFSE_TEST_BASE_URL = previous;
  }
});
