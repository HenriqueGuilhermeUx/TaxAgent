import assert from 'node:assert/strict';
import test from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import { SimulatorBatchService } from '../src/official-rtc/simulator-batch.service';

function regular(operation_id: string, year = 2026) {
  return {
    operation_id,
    effective_at: `${year}-03-10T10:00:00-03:00`,
    municipality_code: '4314902',
    uf: 'RS',
    document_kind: 'nfse' as const,
    items: [{
      number: 1,
      nbs: '115012000',
      cst: '200',
      tax_classification: '200043',
      tax_base: 200,
      ...(year >= 2027 ? { nominal_rates: { cbs: 8.8, ibs_state: 0.05, ibs_municipal: 0.05 } } : {}),
    }],
  };
}

function simples(operation_id: string) {
  return {
    operation_id,
    effective_date: '2027-03-15',
    document_kind: 'nfe' as const,
    crt: '1' as const,
    items: [{
      number: 1,
      activity_code: '01',
      tax_classification: '000001',
      tax_base: 950,
      selective_tax_amount: 50,
      ibs_effective_rate: 1.25,
      cbs_effective_rate: 2.75,
    }],
  };
}

test('simulator readiness exposes validate-only even when engines are off', async () => {
  const service = new SimulatorBatchService(
    {
      status: () => ({
        mode: 'off',
        engines: {
          regular: { configured: false },
          simples: { configured: false },
        },
      }),
      freshness: async () => ({
        regular: { authoritative_eligible: false, status: 'reference_ahead' },
      }),
    } as any,
    {} as any,
  );

  const readiness = await service.readiness();
  assert.equal(readiness.policy.validate_only_available, true);
  assert.equal(readiness.engines.regular.calculation_available, false);
  assert.equal(readiness.engines.regular.authoritative_available, false);
  assert.equal(readiness.engines.simples.calculation_available, false);
  assert.equal(readiness.engines.simples.reference_only, true);
  assert.equal(readiness.policy.financial_action_allowed, false);
});

test('regular validate-only enforces year/rate contract without calling engine', () => {
  const service = new SimulatorBatchService({} as any, {} as any);
  assert.equal(service.validateRegular(regular('r1')).status, 'valid');

  const missingRates = regular('r2', 2027);
  delete (missingRates.items[0] as any).nominal_rates;
  assert.throws(() => service.validateRegular(missingRates as any));

  const forbiddenRates = regular('r3');
  (forbiddenRates.items[0] as any).nominal_rates = { cbs: 1, ibs_state: 1, ibs_municipal: 1 };
  assert.throws(() => service.validateRegular(forbiddenRates as any));
});

test('validate-only batch never calls calculation service and preserves row correlation', async () => {
  let calls = 0;
  const service = new SimulatorBatchService(
    {} as any,
    { calculateRegular: async () => { calls += 1; throw new Error('must not run'); } } as any,
  );
  const result = await service.regularBatch('company', 'test', {
    execution: 'validate',
    rows: [regular('row-1'), regular('row-2')],
  });
  assert.equal(calls, 0);
  assert.equal(result.total, 2);
  assert.equal(result.counts.valid, 2);
  assert.deepEqual(result.rows.map((row) => row.operation_id), ['row-1', 'row-2']);
  assert.equal(result.policy.zero_tax_on_error, false);
});

test('calculate batch returns per-row engine-unavailable without inventing zero tax', async () => {
  const service = new SimulatorBatchService(
    {} as any,
    { calculateRegular: async () => { throw new ServiceUnavailableException('off'); } } as any,
  );
  const result = await service.regularBatch('company', 'test', {
    execution: 'calculate',
    rows: [regular('row-1'), regular('row-2')],
  });
  assert.equal(result.counts.engine_unavailable, 2);
  for (const row of result.rows) {
    assert.equal(row.status, 'engine_unavailable');
    assert.equal(row.reference_only, true);
    assert.equal(row.error_code, 'engine_unavailable');
    assert.equal('tax_amount' in row, false);
  }
});

test('calculate batch preserves successful decisions and isolates a failed row', async () => {
  const service = new SimulatorBatchService(
    {} as any,
    {
      calculateRegular: async (_company: string, _environment: string, row: any) => {
        if (row.operation_id === 'bad') throw new ServiceUnavailableException('temporary');
        return {
          decision_id: `taxdec_${row.operation_id}`,
          status: 'resolved',
          authoritative: false,
          reference_only: true,
        };
      },
    } as any,
  );
  const result = await service.regularBatch('company', 'test', {
    execution: 'calculate',
    rows: [regular('ok'), regular('bad')],
  });
  assert.equal(result.rows[0].status, 'calculated');
  assert.equal(result.rows[0].decision_id, 'taxdec_ok');
  assert.equal(result.rows[1].status, 'engine_unavailable');
  assert.equal(result.total, 2);
});

test('Simples batch stays reference-only even for calculated rows', async () => {
  const service = new SimulatorBatchService(
    {} as any,
    {
      calculateSimples: async () => ({
        decision_id: 'taxdec_simples',
        status: 'resolved',
        authoritative: false,
        reference_only: true,
      }),
    } as any,
  );
  const result = await service.simplesBatch('company', 'test', {
    execution: 'calculate',
    rows: [simples('s1')],
  });
  assert.equal(result.rows[0].status, 'calculated');
  assert.equal(result.rows[0].reference_only, true);
  assert.equal(result.rows[0].authoritative, false);
  assert.equal(result.policy.financial_action_allowed, false);
});


test('Simples validate-only accepts pinned official NFS-e document kind without calling sidecar', () => {
  const service = new SimulatorBatchService({} as any, {} as any);
  const result = service.validateSimples({
    operation_id: 'simples-nfse',
    effective_date: '2027-03-15',
    document_kind: 'nfse',
    crt: '1',
    items: [{
      number: 1,
      activity_code: '07',
      tax_classification: '000001',
      tax_base: 1000,
      selective_tax_amount: 0,
      ibs_effective_rate: 1.25,
      cbs_effective_rate: 2.75,
    }],
  });
  assert.equal(result.status, 'valid');
  assert.equal(result.document_kind, 'nfse');
  assert.equal(result.reference_only, true);
  assert.equal(result.policy.issuance_binding_allowed, false);
});
