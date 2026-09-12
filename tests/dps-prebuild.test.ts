import assert from 'node:assert/strict';
import test from 'node:test';
import { DpsPreflightService } from '../src/operations/dps-preflight.service';

test('unsigned DPS prebuild validates the fiscal path without touching Certificate Vault or signature', async () => {
  let vaultCalls = 0;
  let signatureCalls = 0;
  let strictCalls = 0;

  const service = new DpsPreflightService(
    { async getCompany() { return { id: 'comp_test', tax_id: 'TESTCOMPANY0001', municipal_registration: null, city_code: '3530607', tax_regime: 'regular' }; } } as any,
    {
      async hydrateServiceFromDecision(_companyId: string, decisionId: string, input: any) {
        assert.equal(decisionId, 'taxdec_resolved');
        return { ...input, nationalServiceCode: '170101', operationIndicator: '100301', taxSituation: '000', taxClassification: '000001', issTaxation: '1', issWithholding: '1', issRate: 4 };
      },
      validate(input: any) { return input; },
    } as any,
    {
      buildPreview(input: any) {
        assert.equal(input.service.nationalServiceCode, '170101');
        assert.equal(input.service.issRate, 4);
        return { xml: '<DPS/>', id: 'DPS_TEST', sequence: 1, series: '1', verifiedLayout: true };
      },
    } as any,
    {
      async validateWellFormed(xml: string) { assert.equal(xml, '<DPS/>'); },
      async validateStrict(xml: string, environment: string) { assert.equal(xml, '<DPS/>'); assert.equal(environment, 'test'); strictCalls += 1; },
    } as any,
    { sign() { signatureCalls += 1; throw new Error('signature must not run in prebuild'); } } as any,
    { async getActiveMaterial() { vaultCalls += 1; throw new Error('vault must not run in prebuild'); } } as any,
    { active(environment: string) { assert.equal(environment, 'test'); return { id: 'schema-test' }; } } as any,
  );

  const result = await service.prebuild({
    company_id: 'comp_test', environment: 'test', competence: '2026-08-14', tax_decision_id: 'taxdec_resolved',
    customer: { tax_id: 'TESTCUSTOMER01', name: 'EMPRESA CLIENTE TESTE', city_code: '3550308' },
    service: { description: 'Servicos de consultoria empresarial', amount: 100, service_location_city_code: '3530607' },
  });

  assert.equal(result.valid, true);
  assert.equal(result.signed, false);
  assert.equal(result.transmitted, false);
  assert.equal(result.certificate_required, false);
  assert.equal(result.schema, 'schema-test');
  assert.equal(result.fiscal_summary.national_service_code, '170101');
  assert.equal(result.fiscal_summary.iss_rate, 4);
  assert.equal(strictCalls, 1);
  assert.equal(vaultCalls, 0);
  assert.equal(signatureCalls, 0);
});
