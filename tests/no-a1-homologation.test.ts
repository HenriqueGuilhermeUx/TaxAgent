import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { NoA1HomologationService } from '../src/operations/no-a1-homologation.service';

const dto = {
  company_id: 'comp_test',
  environment: 'test',
  customer: { tax_id: '12345678901', name: 'Cliente Teste', city_code: '3550308' },
  service: {
    description: 'Servico de teste',
    amount: 100,
    national_service_code: '010201',
    service_location_city_code: '3550308',
    iss_taxation: '1',
    iss_withholding: '1',
  },
  tax_decision_id: 'taxdec_test',
} as any;

test('no-A1 track proves pre-certificate path without signing or transmission', async () => {
  let reportCalls = 0;
  let prebuildCalls = 0;
  const readiness = {
    async report(companyId: string, environment: string) {
      reportCalls += 1;
      assert.equal(companyId, 'comp_test');
      assert.equal(environment, 'test');
      return {
        readyWithoutCertificate: true,
        failedBlockingGatesBeforeCertificate: [],
        remainingCertificateGates: ['certificate_a1', 'certificate_company_binding'],
      };
    },
  } as any;
  const dpsPreflight = {
    async prebuild(input: any) {
      prebuildCalls += 1;
      assert.equal(input, dto);
      return {
        valid: true,
        signed: false,
        transmitted: false,
        dps_id: 'DPS123',
        schema: 'nfse-prodrest-v1',
        unsigned_xml_sha256: 'abc123',
        tax_decision_id: 'taxdec_test',
        fiscal_summary: { cst: '000' },
      };
    },
    async validate() {
      throw new Error('validate/sign path must never be called by no-A1 track');
    },
  } as any;

  const service = new NoA1HomologationService(readiness, dpsPreflight);
  const result = await service.validate(dto);

  assert.equal(reportCalls, 1);
  assert.equal(prebuildCalls, 1);
  assert.equal(result.valid, true);
  assert.equal(result.track, 'no-a1');
  assert.equal(result.transmitted, false);
  assert.equal(result.transmission_possible, false);
  assert.equal(result.certificate_used, false);
  assert.equal(result.ready_without_certificate, true);
  assert.deepEqual(result.remaining_certificate_gates, ['certificate_a1', 'certificate_company_binding']);
  assert.equal(result.dps.signed, false);
});

test('no-A1 track reports pre-certificate blockers even if unsigned DPS can be built', async () => {
  const readiness = {
    async report() {
      return {
        readyWithoutCertificate: false,
        failedBlockingGatesBeforeCertificate: ['official_schema'],
        remainingCertificateGates: ['certificate_a1', 'certificate_company_binding'],
      };
    },
  } as any;
  const dpsPreflight = {
    async prebuild() {
      return {
        valid: true,
        signed: false,
        transmitted: false,
        dps_id: 'DPS123',
        schema: 'nfse-prodrest-v1',
        unsigned_xml_sha256: 'abc123',
        tax_decision_id: 'taxdec_test',
      };
    },
  } as any;

  const service = new NoA1HomologationService(readiness, dpsPreflight);
  const result = await service.validate(dto);

  assert.equal(result.valid, false);
  assert.equal(result.ready_without_certificate, false);
  assert.deepEqual(result.failed_before_certificate, ['official_schema']);
  assert.match(result.next_stage, /Resolve the failed pre-certificate gates/);
});

test('no-A1 validity requires readiness boolean even when blocker list is unexpectedly empty', async () => {
  const readiness = { report: async () => ({ readyWithoutCertificate: false, failedBlockingGatesBeforeCertificate: [], remainingCertificateGates: [] }) } as any;
  const dpsPreflight = { prebuild: async () => ({ valid: true, signed: false, transmitted: false }) } as any;
  const result = await new NoA1HomologationService(readiness, dpsPreflight).validate(dto);
  assert.equal(result.valid, false);
  assert.equal(result.ready_without_certificate, false);
});

test('no-A1 validity refuses any prebuild that reports signature or transmission side effects', async () => {
  const readiness = { report: async () => ({ readyWithoutCertificate: true, failedBlockingGatesBeforeCertificate: [], remainingCertificateGates: [] }) } as any;
  const signedPreflight = { prebuild: async () => ({ valid: true, signed: true, transmitted: false }) } as any;
  const transmittedPreflight = { prebuild: async () => ({ valid: true, signed: false, transmitted: true }) } as any;
  assert.equal((await new NoA1HomologationService(readiness, signedPreflight).validate(dto)).valid, false);
  assert.equal((await new NoA1HomologationService(readiness, transmittedPreflight).validate(dto)).valid, false);
});

test('no-A1 track is hard-blocked outside test environment', async () => {
  const readiness = { report: async () => ({}) } as any;
  const dpsPreflight = { prebuild: async () => ({}) } as any;
  const service = new NoA1HomologationService(readiness, dpsPreflight);

  await assert.rejects(
    () => service.validate({ ...dto, environment: 'production' }),
    (error: unknown) => error instanceof BadRequestException && /restricted to environment=test/.test(error.message),
  );
});
