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


test('shared client exposes simulator readiness and validates batch safety envelope', async () => {
  const calls: string[] = [];
  const client = new TaxAgentFiscalClient({
    baseUrl: 'https://taxagent.example',
    apiKey: 'server-key',
    fetchImpl: (async (input: URL | RequestInfo, init?: RequestInit) => {
      calls.push(String(input));
      if (String(input).endsWith('/v1/rtc/simulator/readiness')) {
        return response({ mode: 'off', policy: { financial_action_allowed: false, issuance_binding_allowed: false } });
      }
      return response({
        regime: 'regular',
        execution: 'validate',
        rows: [{ operation_id: 'op-1', status: 'valid', reference_only: true }],
        counts: { valid: 1 },
        total: 1,
        policy: { partial_results: true, zero_tax_on_error: false, financial_action_allowed: false, issuance_binding_allowed: false },
      });
    }) as typeof fetch,
  });

  await client.simulatorReadiness();
  const result = await client.batchRegular('validate', [{
    operation_id: 'op-1',
    effective_at: '2026-03-10T10:00:00-03:00',
    municipality_code: '4314902',
    uf: 'RS',
    document_kind: 'nfse',
    items: [{ number: 1, nbs: '115012000', cst: '200', tax_classification: '200043', tax_base: 200 }],
  }]);

  assert.equal(result.total, 1);
  assert.equal(result.rows[0].status, 'valid');
  assert.equal(result.policy.financial_action_allowed, false);
  assert.equal(result.policy.issuance_binding_allowed, false);
  assert.equal(calls.some((url) => url.endsWith('/v1/rtc/simulator/readiness')), true);
  assert.equal(calls.some((url) => url.endsWith('/v1/rtc/simulator/regular/batch')), true);
});

test('shared client rejects unsafe or malformed batch envelopes', async () => {
  const client = new TaxAgentFiscalClient({
    baseUrl: 'https://taxagent.example',
    apiKey: 'server-key',
    fetchImpl: (async () => response({
      regime: 'regular',
      execution: 'calculate',
      rows: [{ operation_id: 'op-1', status: 'calculated', reference_only: false }],
      counts: { calculated: 1 },
      total: 1,
      policy: { financial_action_allowed: true, issuance_binding_allowed: false },
    })) as typeof fetch,
  });

  await assert.rejects(
    () => client.batchRegular('calculate', [{
      operation_id: 'op-1',
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
    }]),
    (error: unknown) => error instanceof TaxAgentFiscalClientError && error.code === 'invalid_response',
  );
});


test('shared client accepts only bounded safe agent summaries', async () => {
  const client = new TaxAgentFiscalClient({
    baseUrl: 'https://taxagent.example',
    apiKey: 'server-key',
    fetchImpl: (async () => response({
      decision_id: 'taxdec_1',
      decision_kind: 'rtc_calculation',
      effective_at: '2026-11-19',
      status: 'resolved',
      regime: 'regular',
      environment: 'test',
      use: 'reference_only',
      authoritative: false,
      reference_only: true,
      next_action: 'explain_reference_only_no_execution',
      message: { locale: 'pt-BR', text: 'Resultado apenas de referência.' },
      policy: {
        ai_authoritative: false,
        financial_action_allowed: false,
        issuance_binding_allowed: false,
        raw_fiscal_payload_exposed: false,
        raw_document_content_exposed: false,
        taxpayer_pii_exposed: false,
      },
    })) as typeof fetch,
  });

  const summary = await client.agentSummary('taxdec_1');
  assert.equal(summary.use, 'reference_only');
  assert.equal(summary.policy.financial_action_allowed, false);
  assert.equal(summary.policy.issuance_binding_allowed, false);
});

test('shared client rejects agent summaries that claim execution authority', async () => {
  const client = new TaxAgentFiscalClient({
    baseUrl: 'https://taxagent.example',
    apiKey: 'server-key',
    fetchImpl: (async () => response({
      decision_id: 'taxdec_1',
      decision_kind: 'rtc_calculation',
      effective_at: '2026-11-19',
      status: 'resolved',
      regime: 'regular',
      environment: 'test',
      use: 'reference_only',
      authoritative: false,
      reference_only: true,
      next_action: 'execute_payment',
      message: { locale: 'pt-BR', text: 'unsafe' },
      policy: {
        ai_authoritative: false,
        financial_action_allowed: true,
        issuance_binding_allowed: false,
        raw_fiscal_payload_exposed: false,
        raw_document_content_exposed: false,
        taxpayer_pii_exposed: false,
      },
    })) as typeof fetch,
  });

  await assert.rejects(
    () => client.agentSummary('taxdec_1'),
    (error: unknown) => error instanceof TaxAgentFiscalClientError && error.code === 'invalid_response',
  );
});


test('shared client accepts only bounded read-only fiscal readiness proofs', async () => {
  const client = new TaxAgentFiscalClient({
    baseUrl: 'https://taxagent.example',
    apiKey: 'server-key',
    fetchImpl: (async (input: URL | RequestInfo) => {
      assert.equal(String(input), 'https://taxagent.example/v1/portal/companies/comp_1/fiscal/proof');
      return response({
        proof_version: 'pilot-readiness-v1',
        company: { id: 'comp_1' },
        environment: 'test',
        effective_at: '2026-11-19',
        fiscal_status: 'ACTION_REQUIRED',
        onboarding_status: 'BLOCKED',
        route: { resolved_route: 'national-direct' },
        readiness: {
          homologation_ready: false,
          unresolved_requirements: ['active_a1'],
          stages: [{ id: 'a1_certificate', status: 'ACTION_REQUIRED' }],
        },
        evidence_presence: { onboarding: true, preflight: false },
        next_action: { action: 'Upload A1 securely' },
        authorization_boundary: {
          read_only: true,
          portal_can_issue_invoice: false,
          portal_can_transmit_fiscal_document: false,
          portal_can_enable_live_runtime: false,
          portal_can_grant_transmission_permit: false,
          customer_api_key_can_bypass_one_shot_permit: false,
          one_shot_test_transmission_permit_required_for_first_real_attempt: true,
        },
        checked_at: '2026-11-19T21:15:00-03:00',
      });
    }) as typeof fetch,
  });

  const proof = await client.fiscalReadinessProof('comp_1');
  assert.equal(proof.readiness.homologation_ready, false);
  assert.deepEqual(proof.readiness.unresolved_requirements, ['active_a1']);
  assert.equal(proof.authorization_boundary.portal_can_transmit_fiscal_document, false);
});

test('shared client rejects readiness proofs that claim execution authority', async () => {
  const client = new TaxAgentFiscalClient({
    baseUrl: 'https://taxagent.example',
    apiKey: 'server-key',
    fetchImpl: (async () => response({
      proof_version: 'pilot-readiness-v1',
      company: { id: 'comp_1' },
      environment: 'test',
      effective_at: '2026-11-19',
      fiscal_status: 'HOMOLOGATION_READY',
      onboarding_status: 'READY_FOR_HOMOLOGATION',
      route: { resolved_route: 'national-direct' },
      readiness: {
        homologation_ready: true,
        unresolved_requirements: [],
        stages: [],
      },
      evidence_presence: { onboarding: true, preflight: true },
      next_action: null,
      authorization_boundary: {
        read_only: false,
        portal_can_issue_invoice: true,
        portal_can_transmit_fiscal_document: true,
        portal_can_enable_live_runtime: true,
        portal_can_grant_transmission_permit: true,
        customer_api_key_can_bypass_one_shot_permit: true,
        one_shot_test_transmission_permit_required_for_first_real_attempt: false,
      },
      checked_at: '2026-11-19T21:15:00-03:00',
    })) as typeof fetch,
  });

  await assert.rejects(
    () => client.fiscalReadinessProof('comp_1'),
    (error: unknown) => error instanceof TaxAgentFiscalClientError && error.code === 'invalid_response',
  );
});

test('shared client rejects unsafe readiness proof identifiers before making a request', async () => {
  const client = new TaxAgentFiscalClient({
    baseUrl: 'https://taxagent.example',
    apiKey: 'server-key',
    fetchImpl: (async () => { throw new Error('must not call network'); }) as typeof fetch,
  });

  await assert.rejects(
    () => client.fiscalReadinessProof('../other-company'),
    (error: unknown) => error instanceof TaxAgentFiscalClientError && error.code === 'invalid_config',
  );
});


test('shared client rejects readiness proof for a different company', async () => {
  const client = new TaxAgentFiscalClient({
    baseUrl: 'https://taxagent.example',
    apiKey: 'server-key',
    fetchImpl: (async () => response({
      proof_version: 'pilot-readiness-v1',
      company: { id: 'comp_other' },
      environment: 'test',
      effective_at: '2026-11-19',
      fiscal_status: 'ACTION_REQUIRED',
      onboarding_status: 'BLOCKED',
      route: { resolved_route: 'national-direct' },
      readiness: {
        homologation_ready: false,
        unresolved_requirements: ['active_a1'],
        stages: [{ id: 'a1_certificate', status: 'ACTION_REQUIRED' }],
      },
      evidence_presence: { onboarding: true, preflight: false },
      next_action: null,
      authorization_boundary: {
        read_only: true,
        portal_can_issue_invoice: false,
        portal_can_transmit_fiscal_document: false,
        portal_can_enable_live_runtime: false,
        portal_can_grant_transmission_permit: false,
        customer_api_key_can_bypass_one_shot_permit: false,
        one_shot_test_transmission_permit_required_for_first_real_attempt: true,
      },
      checked_at: '2026-11-19T21:30:00-03:00',
    })) as typeof fetch,
  });

  await assert.rejects(
    () => client.fiscalReadinessProof('comp_1'),
    (error: unknown) => error instanceof TaxAgentFiscalClientError && error.code === 'invalid_response',
  );
});


test('shared fiscal client rejects invalid expected environment configuration', () => {
  assert.throws(
    () => new TaxAgentFiscalClient({
      baseUrl: 'https://taxagent.example',
      apiKey: 'server-key',
      expectedEnvironment: 'staging' as any,
    }),
    (error: unknown) => error instanceof TaxAgentFiscalClientError && error.code === 'invalid_config',
  );
});

test('shared fiscal client rejects canonical decisions from a different environment', async () => {
  const client = new TaxAgentFiscalClient({
    baseUrl: 'https://taxagent.example',
    apiKey: 'server-key',
    expectedEnvironment: 'test',
    fetchImpl: (async () => response({
      decision_id: 'taxdec_env',
      decision_kind: 'rtc_calculation',
      status: 'resolved',
      regime: 'regular',
      environment: 'production',
      authoritative: false,
      reference_only: true,
    })) as typeof fetch,
  });

  await assert.rejects(
    () => client.calculateRegular({
      operation_id: 'order-env',
      effective_at: '2026-11-19T22:00:00-03:00',
      municipality_code: '3548500',
      uf: 'SP',
      document_kind: 'nfse',
      items: [{ number: 1, nbs: '115012000', cst: '200', tax_classification: '200043', tax_base: 100 }],
    }),
    (error: unknown) => error instanceof TaxAgentFiscalClientError && error.code === 'invalid_response',
  );
});

test('shared fiscal client rejects readiness proof from a different environment', async () => {
  const client = new TaxAgentFiscalClient({
    baseUrl: 'https://taxagent.example',
    apiKey: 'server-key',
    expectedEnvironment: 'test',
    fetchImpl: (async () => response({
      proof_version: 'pilot-readiness-v1',
      company: { id: 'comp_1' },
      environment: 'production',
      effective_at: '2026-11-19',
      fiscal_status: 'ACTION_REQUIRED',
      onboarding_status: 'BLOCKED',
      route: { resolved_route: 'national-direct' },
      readiness: { homologation_ready: false, unresolved_requirements: ['active_a1'], stages: [] },
      evidence_presence: { onboarding: true, preflight: false },
      next_action: null,
      authorization_boundary: {
        read_only: true,
        portal_can_issue_invoice: false,
        portal_can_transmit_fiscal_document: false,
        portal_can_enable_live_runtime: false,
        portal_can_grant_transmission_permit: false,
        customer_api_key_can_bypass_one_shot_permit: false,
        one_shot_test_transmission_permit_required_for_first_real_attempt: true,
      },
      checked_at: '2026-11-19T22:00:00-03:00',
    })) as typeof fetch,
  });

  await assert.rejects(
    () => client.fiscalReadinessProof('comp_1'),
    (error: unknown) => error instanceof TaxAgentFiscalClientError && error.code === 'invalid_response',
  );
});

test('shared fiscal client rejects agent summary from a different environment', async () => {
  const client = new TaxAgentFiscalClient({
    baseUrl: 'https://taxagent.example',
    apiKey: 'server-key',
    expectedEnvironment: 'test',
    fetchImpl: (async () => response({
      decision_id: 'taxdec_1',
      decision_kind: 'rtc_calculation',
      effective_at: '2026-11-19',
      status: 'resolved',
      regime: 'regular',
      environment: 'production',
      use: 'reference_only',
      authoritative: false,
      reference_only: true,
      next_action: 'explain_reference_only_no_execution',
      message: { locale: 'pt-BR', text: 'Resultado apenas de referência.' },
      policy: {
        ai_authoritative: false,
        financial_action_allowed: false,
        issuance_binding_allowed: false,
        raw_fiscal_payload_exposed: false,
        raw_document_content_exposed: false,
        taxpayer_pii_exposed: false,
      },
    })) as typeof fetch,
  });

  await assert.rejects(
    () => client.agentSummary('taxdec_1'),
    (error: unknown) => error instanceof TaxAgentFiscalClientError && error.code === 'invalid_response',
  );
});


test('shared client validates official Simples activity compatibility and query binding', async () => {
  const client = new TaxAgentFiscalClient({
    baseUrl: 'https://taxagent.example',
    apiKey: 'server-key',
    expectedEnvironment: 'test',
    fetchImpl: (async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      assert.equal(url.pathname, '/v1/rtc/canonical/simples/activities/07');
      assert.equal(url.searchParams.get('effective_date'), '2027-03-15');
      assert.equal(url.searchParams.get('document_kind'), 'nfse');
      assert.equal(url.searchParams.get('tax_classification'), '000001');
      return response({
        activity_code: '07',
        effective_date: '2027-03-15',
        document_kind: 'nfse',
        tax_classification: '000001',
        environment: 'test',
        compatible: true,
        official: {
          available: true,
          admissible_on_document: true,
          compatible_with_tax_classification: true,
          factor_r_subject: false,
          annex_without_factor_r: 'III',
          annex_with_factor_r: null,
          admissible_documents: ['91'],
        },
        source: {
          authority: 'receita-federal-open-source-engine',
          engine_id: 'simples',
          repository: 'https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional',
          release: '0.0.6',
          commit: 'c5b0f01c8351c3f0d0795cc617b29d233e9f98df',
          mode: 'shadow',
          checked_at: '2026-11-19T22:30:00-03:00',
        },
        policy: {
          rates_inferred: false,
          calculation_executed: false,
          financial_action_allowed: false,
          issuance_binding_allowed: false,
        },
      });
    }) as typeof fetch,
  });

  const result = await client.simplesActivityCompatibility({
    activity_code: '07',
    effective_date: '2027-03-15',
    document_kind: 'nfse',
    tax_classification: '000001',
  });
  assert.equal(result.compatible, true);
  assert.deepEqual(result.official.admissible_documents, ['91']);
});

test('shared client rejects activity compatibility envelopes that claim execution authority', async () => {
  const client = new TaxAgentFiscalClient({
    baseUrl: 'https://taxagent.example',
    apiKey: 'server-key',
    expectedEnvironment: 'test',
    fetchImpl: (async () => response({
      activity_code: '07',
      effective_date: '2027-03-15',
      document_kind: 'nfse',
      tax_classification: '000001',
      environment: 'test',
      compatible: true,
      official: {
        available: true,
        admissible_on_document: true,
        compatible_with_tax_classification: true,
        factor_r_subject: false,
        annex_without_factor_r: 'III',
        annex_with_factor_r: null,
        admissible_documents: ['91'],
      },
      source: {
        authority: 'receita-federal-open-source-engine',
        engine_id: 'simples',
        repository: 'repo',
        release: '0.0.6',
        commit: 'commit',
        mode: 'shadow',
        checked_at: '2026-11-19T22:30:00-03:00',
      },
      policy: {
        rates_inferred: false,
        calculation_executed: true,
        financial_action_allowed: true,
        issuance_binding_allowed: true,
      },
    })) as typeof fetch,
  });

  await assert.rejects(
    () => client.simplesActivityCompatibility({
      activity_code: '07',
      effective_date: '2027-03-15',
      document_kind: 'nfse',
      tax_classification: '000001',
    }),
    (error: unknown) => error instanceof TaxAgentFiscalClientError && error.code === 'invalid_response',
  );
});
