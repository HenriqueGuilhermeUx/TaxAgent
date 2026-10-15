import assert from 'node:assert/strict';
import test from 'node:test';
import { TaxEngineService } from '../src/tax-engine/tax-engine.service';

test('TaxEngine resolves business consulting profile and persists municipal ISS evidence', async () => {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const db = {
    async query(sql: string, params?: unknown[]) {
      queries.push({ sql, params });
      return { rowCount: 1, rows: [] };
    },
  };
  const rtc = {
    async getClassificationForNfse(cClassTrib: string, effectiveAt: string) {
      assert.equal(cClassTrib, '000001');
      assert.equal(effectiveAt, '2026-08-14');
      return {
        url: 'https://piloto-cbs.tributos.gov.br/example',
        fetchedAt: '2026-08-14T23:00:00.000Z',
        payload: { siglaDfeInformado: 'NFSE', validoParaSiglaDfeInformado: true },
      };
    },
  };
  const domains = {
    async cacheRecord(dataset: string, key: string) {
      assert.equal(dataset, 'rtc-nfse-cclasstrib');
      assert.equal(key, '000001@2026-08-14');
      return { dataset, record_key: key, sha256: 'abc', source_url: 'https://piloto-cbs.tributos.gov.br/example' };
    },
  };
  const position = { async getDecision() { throw new Error('not used'); } };
  const service = new TaxEngineService(db as any, rtc as any, domains as any, position as any);

  const result = await service.resolve({
    company_id: 'comp_test',
    effective_at: '2026-08-14',
    amount: 100,
    issuer_city_code: '3530607',
    destination_city_code: '3550308',
    service_profile: 'business_consulting',
    iss_withholding: '1',
  });

  assert.equal(result.status, 'resolved');
  assert.deepEqual(result.missing, []);
  assert.equal(result.service_profile, 'business_consulting');
  assert.equal(result.classification.national_service_code, '170101');
  assert.equal(result.classification.cIndOp, '100301');
  assert.equal(result.classification.cst, '000');
  assert.equal(result.classification.cClassTrib, '000001');
  assert.equal(result.classification.tax_treatment, 'standard');
  assert.equal(result.municipal_tax?.iss_item, '17.01');
  assert.equal(result.municipal_tax?.incidence_city_code, '3530607');
  assert.equal(result.municipal_tax?.iss_taxation, '1');
  assert.equal(result.municipal_tax?.iss_withholding, '1');
  assert.equal(result.municipal_tax?.iss_rate, 4);
  assert.ok(result.sources.some((source) => source.dataset === 'mogi-iss-service-rate'));
  assert.ok(queries.some((query) => query.sql.includes('INSERT INTO tax_decisions')));
});

test('TaxEngine service profile rejects explicit fiscal code conflicts', async () => {
  const service = new TaxEngineService(
    { query: async () => ({ rowCount: 1, rows: [] }) } as any,
    {} as any,
    {} as any,
    {} as any,
  );

  await assert.rejects(
    () => service.resolve({
      company_id: 'comp_test',
      effective_at: '2026-08-14',
      amount: 100,
      issuer_city_code: '3530607',
      destination_city_code: '3550308',
      service_profile: 'business_consulting',
      iss_withholding: '1',
      cst: '200',
    }),
    /cst conflicts with selected TaxAgent service profile/,
  );
});

test('TaxEngine hydrates municipal ISS fields from a resolved profile decision', async () => {
  const position = {
    async getDecision() {
      return {
        status: 'resolved',
        output: {
          classification: {
            national_service_code: '170101',
            cIndOp: '100301',
            cst: '000',
            cClassTrib: '000001',
          },
          municipal_tax: {
            iss_taxation: '1',
            iss_withholding: '1',
            iss_rate: 4,
          },
        },
      };
    },
  };
  const service = new TaxEngineService({} as any, {} as any, {} as any, position as any);

  const hydrated = await service.hydrateServiceFromDecision('comp_test', 'taxdec_test', {
    description: 'Serviços de consultoria empresarial',
    amount: 100,
    serviceLocationCityCode: '3530607',
  });

  assert.equal(hydrated.nationalServiceCode, '170101');
  assert.equal(hydrated.operationIndicator, '100301');
  assert.equal(hydrated.taxSituation, '000');
  assert.equal(hydrated.taxClassification, '000001');
  assert.equal(hydrated.issTaxation, '1');
  assert.equal(hydrated.issWithholding, '1');
  assert.equal(hydrated.issRate, 4);
});
