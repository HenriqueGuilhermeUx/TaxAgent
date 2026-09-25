import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { NationalDpsEligibilityService } from '../src/operations/national-dps-eligibility.service';

const dto = {
  company_id: 'comp_test',
  environment: 'test' as const,
  competence: '2026-09-23',
  tax_decision_id: 'taxdec_test',
  customer: { tax_id: '12345678901', name: 'Cliente', city_code: '3530607' },
  service: { description: 'Teste', amount: 100, service_location_city_code: '3530607' },
};

test('Prepared DPS eligibility allows only a proven national-direct issuer route', async () => {
  const service = new NationalDpsEligibilityService(
    { getCompany: async () => ({ city_code: '3530607', tax_regime: 'regular' }) } as any,
    { resolve: async () => ({ cityCode: '3530607', environment: 'test', nationalStandard: true, nationalPublicIssuer: true, route: 'national-direct', provider: 'nfse-national', source: 'official-national-parameters', checkedAt: new Date().toISOString() }) } as any,
  );
  const result = await service.assertPreparedDpsAllowed(dto as any);
  assert.equal(result.route, 'national-direct');
  assert.equal(result.provider, 'nfse-national');
});

test('Prepared DPS eligibility blocks municipal-provider issuer before any DPS sequence is consumed', async () => {
  const service = new NationalDpsEligibilityService(
    { getCompany: async () => ({ city_code: '3548500', tax_regime: 'regular' }) } as any,
    { resolve: async () => ({ cityCode: '3548500', environment: 'test', nationalStandard: true, nationalPublicIssuer: false, route: 'municipal-provider', provider: 'giss', source: 'taxagent-observed-official-rejection', checkedAt: new Date().toISOString() }) } as any,
  );
  await assert.rejects(
    service.assertPreparedDpsAllowed({ ...dto, company_id: 'comp_santos' } as any),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      const response = error.getResponse() as Record<string, unknown>;
      assert.equal(response.code, 'TA_NATIONAL_DPS_ISSUER_NOT_ELIGIBLE');
      assert.equal(response.resolved_provider, 'giss');
      assert.equal(response.dps_sequence_consumed, false);
      assert.equal(response.dps_signed, false);
      assert.equal(response.fiscal_transmission_attempted, false);
      return true;
    },
  );
});

test('Prepared DPS eligibility fails closed for unresolved national participation', async () => {
  const service = new NationalDpsEligibilityService(
    { getCompany: async () => ({ city_code: '3530607', tax_regime: 'regular' }) } as any,
    { resolve: async () => ({ cityCode: '3530607', environment: 'test', nationalStandard: true, nationalPublicIssuer: false, route: 'unknown', provider: 'unknown', source: 'official-national-parameters', checkedAt: new Date().toISOString() }) } as any,
  );
  await assert.rejects(
    service.assertPreparedDpsAllowed(dto as any),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      const response = error.getResponse() as Record<string, unknown>;
      assert.equal(response.code, 'TA_NATIONAL_DPS_ISSUER_NOT_ELIGIBLE');
      assert.equal(response.resolved_provider, 'unknown');
      assert.equal(response.dps_sequence_consumed, false);
      assert.equal(response.dps_signed, false);
      assert.equal(response.fiscal_transmission_attempted, false);
      return true;
    },
  );
});
