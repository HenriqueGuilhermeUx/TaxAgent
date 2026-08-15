import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalAutopilotService } from '../src/autopilot/fiscal-autopilot.service';

function fixture() {
  const intents = new Map<string, any>();
  let taxCalls = 0;
  let prepareCalls = 0;

  const db = {
    async query(sql: string, params: any[] = []) {
      if (sql.startsWith('SELECT * FROM fiscal_intents WHERE company_id=')) {
        const found = [...intents.values()].find((row) => row.company_id === params[0] && row.environment === params[1] && row.idempotency_key === params[2]);
        return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
      }
      if (sql.startsWith('INSERT INTO fiscal_intents')) {
        const now = new Date('2026-08-15T22:00:00Z');
        const row = {
          id: params[0], company_id: params[1], environment: params[2], idempotency_key: params[3], request_sha256: params[4],
          request: JSON.parse(params[5]), answers: JSON.parse(params[6]), status: 'needs_input', service_profile: null,
          tax_decision_id: null, prepared_dps_id: null, invoice_id: null, output: {}, created_at: now, updated_at: now,
        };
        intents.set(row.id, row);
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith('SELECT * FROM fiscal_intents WHERE id=')) {
        const row = intents.get(params[0]);
        const found = row && row.company_id === params[1] ? row : undefined;
        return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
      }
      if (sql.startsWith('UPDATE fiscal_intents SET answers=')) {
        const row = intents.get(params[0]); row.answers = JSON.parse(params[1]); row.updated_at = new Date('2026-08-15T22:01:00Z');
        return { rows: [], rowCount: 1 };
      }
      if (sql.startsWith('UPDATE fiscal_intents SET status=')) {
        const row = intents.get(params[0]);
        row.status = params[1]; row.service_profile = params[2]; row.tax_decision_id = params[3]; row.prepared_dps_id = params[4]; row.invoice_id = params[5]; row.output = JSON.parse(params[6]); row.updated_at = new Date('2026-08-15T22:02:00Z');
        return { rows: [row], rowCount: 1 };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };

  const tenancy = { async getCompany() { return { id: 'comp_test', city_code: '3530607' }; } };
  const taxEngine = {
    async resolve(input: any) {
      taxCalls += 1;
      assert.equal(input.service_profile, 'business_consulting');
      assert.equal(input.iss_withholding, '1');
      assert.equal(input.destination_city_code, '3550308');
      return {
        id: 'taxdec_auto', status: 'resolved', classification: { national_service_code: '170101', cIndOp: '100301', cst: '000', cClassTrib: '000001' },
        municipal_tax: { iss_item: '17.01', incidence_city_code: '3530607', iss_taxation: '1', iss_withholding: '1', iss_rate: 4 }, missing: [], warnings: [],
      };
    },
  };
  const preparedDps = {
    async prepare(input: any, key: string) {
      prepareCalls += 1;
      assert.equal(input.tax_decision_id, 'taxdec_auto');
      assert.equal(input.service.service_location_city_code, '3530607');
      assert.match(key, /^autopilot:fint_/);
      return { id: 'pdps_auto', status: 'prepared', dps_id: 'DPS_TEST', sequence: 1, series: '1', competence: '2026-08-15', issued_at: '2026-08-15T22:00:00+00:00', schema: 'nfse-prodrest-v1.01-20260727', unsigned_xml_sha256: 'abc', signed: false, transmitted: false };
    },
    async sign() { throw new Error('must not sign without certificate readiness'); },
    async inspect() { throw new Error('not used'); },
  };
  const readiness = {
    async report() { return { gates: [{ id: 'certificate_a1', status: 'fail' }, { id: 'certificate_company_binding', status: 'fail' }], readyToEnableLive: false, readyForTransmission: false, failedBlockingGates: ['certificate_a1'] }; },
    async probe() { throw new Error('must not probe before certificate is ready'); },
  };
  const invoices = { async findOneForCompany() { throw new Error('not used'); }, async create() { throw new Error('not used'); } };
  const service = new FiscalAutopilotService(db as any, tenancy as any, taxEngine as any, preparedDps as any, readiness as any, invoices as any);

  const base = {
    company_id: 'comp_test', environment: 'test' as const, competence: '2026-08-15',
    customer: { tax_id: '12345678000199', name: 'Cliente LTDA', city_code: '3550308' },
    service: { description: 'Serviços de consultoria empresarial', amount: 100 },
  };
  return { service, base, taxCalls: () => taxCalls, prepareCalls: () => prepareCalls };
}

test('Fiscal Autopilot turns a human operation into Tax Decision + Prepared DPS in one call', async () => {
  const f = fixture();
  const result: any = await f.service.start({ ...f.base, iss_withholding: 'not_withheld' }, 'auto-one-click');
  assert.equal(result.status, 'prepared');
  assert.equal(result.tax_decision_id, 'taxdec_auto');
  assert.equal(result.prepared_dps_id, 'pdps_auto');
  assert.equal(result.stage, 'prepared_waiting_certificate');
  assert.equal(result.next_action.kind, 'install_a1');
  assert.equal(f.taxCalls(), 1);
  assert.equal(f.prepareCalls(), 1);

  const retry: any = await f.service.start({ ...f.base, iss_withholding: 'not_withheld' }, 'auto-one-click');
  assert.equal(retry.prepared_dps_id, 'pdps_auto');
  assert.equal(f.taxCalls(), 1);
  assert.equal(f.prepareCalls(), 1);
});

test('Fiscal Autopilot asks a human retention question instead of inventing tpRetISSQN', async () => {
  const f = fixture();
  const result: any = await f.service.start(f.base, 'auto-needs-retention');
  assert.equal(result.status, 'needs_input');
  assert.equal(result.question.id, 'iss_withholding');
  assert.equal(f.taxCalls(), 0);
  assert.equal(f.prepareCalls(), 0);
});

test('Fiscal Autopilot asks for service clarification when text is not safely classifiable', async () => {
  const f = fixture();
  const result: any = await f.service.start({ ...f.base, service: { ...f.base.service, description: 'Consultoria' }, iss_withholding: 'not_withheld' }, 'auto-needs-service');
  assert.equal(result.status, 'needs_input');
  assert.equal(result.question.id, 'service_kind');
  assert.equal(f.taxCalls(), 0);
});
