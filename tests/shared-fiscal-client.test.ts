import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TaxAgentFiscalClient,
  TaxAgentFiscalClientError,
  assessFiscalDecisionSafety,
} from '../src/integrations/shared-fiscal-client';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('shared fiscal client rejects insecure remote URLs and embedded credentials', () => {
  assert.throws(
    () => new TaxAgentFiscalClient({ baseUrl: 'http://tax.example.com', apiKey: 'key' }),
    (error: unknown) => error instanceof TaxAgentFiscalClientError && error.code === 'invalid_config',
  );
  assert.throws(
    () => new TaxAgentFiscalClient({ baseUrl: 'https://user:pass@tax.example.com', apiKey: 'key' }),
    (error: unknown) => error instanceof TaxAgentFiscalClientError && error.code === 'invalid_config',
  );
  assert.doesNotThrow(
    () => new TaxAgentFiscalClient({ baseUrl: 'http://127.0.0.1:3000', apiKey: 'key' }),
  );
});

test('shared fiscal client calls canonical regular endpoint without embedding tax logic', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new TaxAgentFiscalClient({
    baseUrl: 'https://taxagent.example',
    apiKey: 'server-key',
    fetchImpl: (async (input: URL | RequestInfo, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return response({
        decision_id: 'taxdec_1',
        decision_kind: 'rtc_calculation',
        status: 'resolved',
        regime: 'regular',
        environment: 'test',
        authoritative: false,
        reference_only: true,
      });
    }) as typeof fetch,
  });

  const decision = await client.calculateRegular({
    operation_id: 'order-1',
    effective_at: '2027-03-10T10:00:00-03:00',
    municipality_code: '4314902',
    uf: 'RS',
    document_kind: 'nfse',
    items: [{
      number: 1,
      nbs: '122011200',
      cst: '200',
      tax_classification: '200028',
      tax_base: 1200,
      nominal_rates: { cbs: 8.8, ibs_state: 0.05, ibs_municipal: 0.05 },
    }],
  });

  assert.equal(decision.reference_only, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://taxagent.example/v1/rtc/canonical/regular/calculate');
  assert.equal((calls[0].init?.headers as Record<string, string>).authorization, 'Bearer server-key');
  assert.equal(String(calls[0].init?.body).includes('"cbs":8.8'), true);
});

test('decision safety never authorizes financial movement or invoice binding', () => {
  const authoritative = assessFiscalDecisionSafety({
    decision_id: 'd1',
    decision_kind: 'rtc_calculation',
    status: 'resolved',
    regime: 'regular',
    environment: 'test',
    authoritative: true,
    reference_only: false,
  });
  assert.deepEqual(authoritative, {
    use: 'authoritative',
    financial_action_allowed: false,
    issuance_binding_allowed: false,
    reason: 'authoritative_tax_calculation_only',
  });

  const reference = assessFiscalDecisionSafety({
    decision_id: 'd2',
    decision_kind: 'rtc_calculation',
    status: 'resolved',
    regime: 'simples',
    environment: 'test',
    authoritative: false,
    reference_only: true,
  });
  assert.equal(reference.use, 'reference_only');
  assert.equal(reference.financial_action_allowed, false);
  assert.equal(reference.issuance_binding_allowed, false);
});

test('unresolved/unsupported decisions require review', () => {
  for (const status of ['requires_input', 'unsupported'] as const) {
    const safety = assessFiscalDecisionSafety({
      decision_id: 'd',
      decision_kind: 'rtc_calculation',
      status,
      regime: 'regular',
      environment: 'test',
      authoritative: false,
      reference_only: true,
    });
    assert.equal(safety.use, 'review_required');
    assert.equal(safety.financial_action_allowed, false);
  }
});

test('HTTP errors do not expose response bodies through the client error', async () => {
  const client = new TaxAgentFiscalClient({
    baseUrl: 'https://taxagent.example',
    apiKey: 'server-key',
    fetchImpl: (async () => new Response('secret fiscal payload', { status: 422 })) as typeof fetch,
  });
  await assert.rejects(
    () => client.status(),
    (error: unknown) => {
      assert.equal(error instanceof TaxAgentFiscalClientError, true);
      assert.equal((error as TaxAgentFiscalClientError).code, 'http_error');
      assert.equal((error as TaxAgentFiscalClientError).httpStatus, 422);
      assert.equal(String(error).includes('secret fiscal payload'), false);
      return true;
    },
  );
});

test('malformed successful decision responses fail closed', async () => {
  const client = new TaxAgentFiscalClient({
    baseUrl: 'https://taxagent.example',
    apiKey: 'server-key',
    fetchImpl: (async () => response({ status: 'resolved', authoritative: true })) as typeof fetch,
  });
  await assert.rejects(
    () => client.calculateSimples({
      operation_id: 'sale',
      effective_date: '2027-03-15',
      document_kind: 'nfe',
      crt: '1',
      items: [{
        number: 1,
        activity_code: '01',
        tax_classification: '000001',
        tax_base: 100,
        selective_tax_amount: 0,
      }],
    }),
    (error: unknown) => error instanceof TaxAgentFiscalClientError && error.code === 'invalid_response',
  );
});
