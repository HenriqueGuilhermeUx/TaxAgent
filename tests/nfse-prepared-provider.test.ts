import assert from 'node:assert/strict';
import test from 'node:test';
import { NfseNationalProvider } from '../src/providers/nfse-national/nfse-national.provider';

const input = {
  companyId: 'comp_test',
  environment: 'test' as const,
  competence: '2026-08-14',
  issuedAt: '2026-08-15T01:30:00+00:00',
  customer: { taxId: '12345678000199', name: 'Cliente LTDA', cityCode: '3550308' },
  service: {
    description: 'Serviços de consultoria empresarial', amount: 100, nationalServiceCode: '170101', serviceLocationCityCode: '3530607',
    issTaxation: '1' as const, issWithholding: '1' as const, issRate: 4, operationIndicator: '100301', taxSituation: '000', taxClassification: '000001',
  },
};

function fixture(reconciled: any) {
  let builderCalls = 0;
  let findCalls = 0;
  let issueCalls = 0;
  let transmittedXml = '';
  const record = {
    id: 'pdps_test', company_id: 'comp_test', environment: 'test', tax_decision_id: 'taxdec_test', schema_id: 'nfse-prodrest-v1.01-20260727',
    dps_id: 'DPS353060724705102600012200001000000000000001', sequence: 1, series: '1', issued_at: input.issuedAt, competence: input.competence,
    unsigned_xml_sha256: 'unsigned', signed_xml_sha256: 'signed',
  };
  const provider = new NfseNationalProvider(
    { async getCompany() { return { city_code: '3530607', tax_regime: 'regular' }; } } as any,
    { async getActiveMaterial() { return { fingerprint: 'fp' }; } } as any,
    { active() { return { id: 'nfse-prodrest-v1.01-20260727' }; } } as any,
    {} as any,
    { async build() { builderCalls += 1; throw new Error('builder must not run for Prepared DPS'); } } as any,
    {} as any,
    {} as any,
    {} as any,
    {
      async findByDpsId() { findCalls += 1; return reconciled; },
      async getByAccessKey() { return { chaveAcesso: 'KEY-1', idDps: record.dps_id }; },
      async issue(_environment: string, xml: string) { issueCalls += 1; transmittedXml = xml; return { chaveAcesso: 'KEY-1', idDps: record.dps_id }; },
      decodeNfseXml() { return undefined; },
      sanitize(value: any) { return value; },
    } as any,
    { async latestContent() { return null; }, async save() { return { id: 'doc' }; } } as any,
    {
      async get() { return record; },
      async sign() { return { id: record.id, signed: true }; },
      async signedMaterial() { return { record, signedXml: '<SIGNED-IMMUTABLE/>', unsignedXml: '<UNSIGNED-IMMUTABLE/>' }; },
    } as any,
  );
  return { provider, builderCalls: () => builderCalls, findCalls: () => findCalls, issueCalls: () => issueCalls, transmittedXml: () => transmittedXml };
}

async function withLive<T>(fn: () => Promise<T>): Promise<T> {
  const priorMode = process.env.TAXAGENT_NFSE_MODE;
  const priorLive = process.env.TAXAGENT_LIVE_ENABLED;
  const priorBuilder = process.env.TAXAGENT_DPS_BUILDER_MODE;
  process.env.TAXAGENT_NFSE_MODE = 'live'; process.env.TAXAGENT_LIVE_ENABLED = 'true'; process.env.TAXAGENT_DPS_BUILDER_MODE = 'verified';
  try { return await fn(); }
  finally {
    if (priorMode === undefined) delete process.env.TAXAGENT_NFSE_MODE; else process.env.TAXAGENT_NFSE_MODE = priorMode;
    if (priorLive === undefined) delete process.env.TAXAGENT_LIVE_ENABLED; else process.env.TAXAGENT_LIVE_ENABLED = priorLive;
    if (priorBuilder === undefined) delete process.env.TAXAGENT_DPS_BUILDER_MODE; else process.env.TAXAGENT_DPS_BUILDER_MODE = priorBuilder;
  }
}

test('Prepared DPS path reconciles by immutable dps_id and does not POST or rebuild when SEFIN already has it', async () => {
  const f = fixture({ chaveAcesso: 'KEY-1', idDps: 'DPS353060724705102600012200001000000000000001' });
  const result = await withLive(() => f.provider.issue(input, { invoiceId: 'inv_test', preparedDpsId: 'pdps_test' }));
  assert.equal(result.status, 'authorized');
  assert.equal(f.findCalls(), 1);
  assert.equal(f.issueCalls(), 0);
  assert.equal(f.builderCalls(), 0);
});

test('Prepared DPS path POSTs the exact persisted signed XML only after reconciliation confirms absence', async () => {
  const f = fixture(null);
  const result = await withLive(() => f.provider.issue(input, { invoiceId: 'inv_test', preparedDpsId: 'pdps_test' }));
  assert.equal(result.status, 'authorized');
  assert.equal(f.findCalls(), 1);
  assert.equal(f.issueCalls(), 1);
  assert.equal(f.transmittedXml(), '<SIGNED-IMMUTABLE/>');
  assert.equal(f.builderCalls(), 0);
});
