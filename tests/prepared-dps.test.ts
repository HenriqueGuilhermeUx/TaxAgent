import assert from 'node:assert/strict';
import test from 'node:test';
import { PreparedDpsRecord, PreparedDpsService } from '../src/prepared-dps/prepared-dps.service';

function fixture() {
  const records = new Map<string, PreparedDpsRecord>();
  let nextSequence = 1;
  let signatureInput = '';
  let vaultCalls = 0;

  const db = {
    async withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
      const client = {
        query: async (sql: string, params: any[] = []) => {
          if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
          if (sql.startsWith('SELECT * FROM prepared_dps WHERE company_id=')) {
            const found = [...records.values()].find((r) => r.company_id === params[0] && r.environment === params[1] && r.idempotency_key === params[2]);
            return { rows: found ? [found] : [] };
          }
          if (sql.includes('INSERT INTO dps_sequences')) return { rows: [{ value: String(nextSequence++) }] };
          if (sql.includes('INSERT INTO prepared_dps')) {
            const record: PreparedDpsRecord = {
              id: params[0], company_id: params[1], environment: params[2], tax_decision_id: params[3], idempotency_key: params[4],
              request_sha256: params[5], canonical_input_sha256: params[6], canonical_input: JSON.parse(params[7]), dps_id: params[8],
              sequence: params[9], series: params[10], issued_at: params[11], competence: params[12], schema_id: params[13], builder_mode: params[14],
              unsigned_xml: params[15], unsigned_xml_sha256: params[16], signed_xml: null, signed_xml_sha256: null, certificate_fingerprint: null,
              status: 'prepared', created_at: new Date('2026-08-15T01:00:00Z'), signed_at: null, consumed_at: null,
            };
            records.set(record.id, record);
            return { rows: [record] };
          }
          throw new Error(`unexpected transaction query: ${sql}`);
        },
      };
      return fn(client);
    },
    async query(sql: string, params: any[] = []) {
      if (sql.startsWith('SELECT * FROM prepared_dps WHERE id=')) {
        const record = records.get(params[0]);
        return { rows: record ? [record] : [] };
      }
      if (sql.startsWith('UPDATE prepared_dps\n       SET signed_xml=')) {
        const record = records.get(params[0]);
        if (record && !record.signed_xml) {
          record.signed_xml = params[1]; record.signed_xml_sha256 = params[2]; record.certificate_fingerprint = params[3]; record.status = 'signed'; record.signed_at = new Date('2026-08-15T01:01:00Z');
        }
        return { rows: [], rowCount: record ? 1 : 0 };
      }
      if (sql.startsWith("UPDATE prepared_dps SET status='consumed'")) {
        const record = records.get(params[0]); if (record) { record.status = 'consumed'; record.consumed_at = new Date('2026-08-15T01:02:00Z'); }
        return { rows: [], rowCount: record ? 1 : 0 };
      }
      throw new Error(`unexpected db query: ${sql}`);
    },
  };

  const tenancy = { async getCompany() { return { id: 'comp_test', tax_id: '47051026000122', municipal_registration: null, city_code: '3530607', tax_regime: 'regular' }; } };
  const taxEngine = {
    async hydrateServiceFromDecision(_companyId: string, decisionId: string, service: any) {
      assert.equal(decisionId, 'taxdec_test');
      return { ...service, nationalServiceCode: '170101', operationIndicator: '100301', taxSituation: '000', taxClassification: '000001', issTaxation: '1', issWithholding: '1', issRate: 4 };
    },
    validate(input: any) { return input; },
  };
  const builder = {
    buildPreview(input: any, company: any, sequence: number) {
      const id = `DPS${company.city_code}2${company.tax_id}00001${String(sequence).padStart(15, '0')}`;
      return { xml: `<DPS Id="${id}" dhEmi="${input.issuedAt}" amount="${input.service.amount}"/>`, id, sequence, series: '1', verifiedLayout: false };
    },
  };
  const validation = { async validateWellFormed() {}, async validateStrict() {} };
  const signature = { sign(xml: string) { signatureInput = xml; return `<SIGNED>${xml}</SIGNED>`; } };
  const vault = { async getActiveMaterial() { vaultCalls += 1; return { fingerprint: 'fp_test' }; } };
  const schemas = { active() { return { id: 'nfse-prodrest-v1.01-20260727' }; } };
  const service = new PreparedDpsService(db as any, tenancy as any, taxEngine as any, builder as any, validation as any, signature as any, vault as any, schemas as any);

  const dto = {
    company_id: 'comp_test', environment: 'test' as const, competence: '2026-08-14', tax_decision_id: 'taxdec_test',
    customer: { tax_id: '12345678000199', name: 'Cliente LTDA', city_code: '3550308' },
    service: { description: 'Serviços de consultoria empresarial', amount: 100, service_location_city_code: '3530607' },
  };

  return { service, dto, records, sequenceCount: () => nextSequence - 1, signatureInput: () => signatureInput, vaultCalls: () => vaultCalls };
}

test('Prepared DPS freezes one real sequence and returns the same artifact for the same Idempotency-Key', async () => {
  const f = fixture();
  const first = await f.service.prepare(f.dto, 'prep-same');
  const second = await f.service.prepare(f.dto, 'prep-same');

  assert.equal(first.id, second.id);
  assert.equal(first.dps_id, second.dps_id);
  assert.equal(first.unsigned_xml_sha256, second.unsigned_xml_sha256);
  assert.equal(first.issued_at, second.issued_at);
  assert.equal(f.sequenceCount(), 1);
  assert.equal(first.status, 'prepared');
  assert.equal(first.signed, false);
  assert.equal(first.resume_payload.prepared_dps_id, first.id);
  assert.equal(first.resume_payload.tax_decision_id, 'taxdec_test');
  assert.equal(first.resume_payload.customer.tax_id, '12345678000199');
  assert.equal(first.resume_payload.service.national_service_code, '170101');
  assert.equal(first.resume_payload.service.iss_rate, 4);
});

test('Prepared DPS inspection can reconstruct the exact frozen invoice payload after a browser refresh', async () => {
  const f = fixture();
  const prepared = await f.service.prepare(f.dto, 'prep-resume');
  const inspected = await f.service.inspect(prepared.id, 'comp_test');

  assert.deepEqual(inspected.resume_payload, prepared.resume_payload);
  assert.equal(inspected.resume_payload.competence, '2026-08-14');
  assert.equal(inspected.resume_payload.customer.name, 'Cliente LTDA');
  assert.equal(inspected.resume_payload.customer.city_code, '3550308');
  assert.equal(inspected.resume_payload.service.service_location_city_code, '3530607');
  assert.equal(inspected.resume_payload.service.tax_situation, '000');
  assert.equal(inspected.resume_payload.service.tax_classification, '000001');
});

test('Prepared DPS rejects reuse of an Idempotency-Key with a different fiscal payload', async () => {
  const f = fixture();
  await f.service.prepare(f.dto, 'prep-conflict');
  await assert.rejects(() => f.service.prepare({ ...f.dto, service: { ...f.dto.service, amount: 101 } }, 'prep-conflict'), /different fiscal payload/);
  assert.equal(f.sequenceCount(), 1);
});

test('Prepared DPS signs exactly the persisted unsigned XML and signing is idempotent', async () => {
  const f = fixture();
  const prepared = await f.service.prepare(f.dto, 'prep-sign');
  const stored = f.records.get(prepared.id)!;
  const exactUnsigned = stored.unsigned_xml.toString('utf8');

  const first = await f.service.sign(prepared.id, 'comp_test');
  const second = await f.service.sign(prepared.id, 'comp_test');

  assert.equal(f.signatureInput(), exactUnsigned);
  assert.equal(first.signed, true);
  assert.equal(first.signed_xml_sha256, second.signed_xml_sha256);
  assert.equal(first.resume_payload.prepared_dps_id, prepared.id);
  assert.equal(f.vaultCalls(), 1);
});

test('Prepared DPS refuses an invoice payload that differs from its frozen canonical input', async () => {
  const f = fixture();
  const prepared = await f.service.prepare(f.dto, 'prep-bind');
  const stored = f.records.get(prepared.id)!;
  await assert.rejects(
    () => f.service.assertBindable(prepared.id, { ...f.dto, service: { ...f.dto.service, amount: 999 } }, { ...stored.canonical_input, service: { ...stored.canonical_input.service, amount: 999 } }),
    /does not match immutable Prepared DPS canonical input/,
  );
});
