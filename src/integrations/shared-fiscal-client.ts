export type FiscalDecisionUse = 'authoritative' | 'reference_only' | 'review_required';

export interface TaxAgentFiscalClientConfig {
  baseUrl: string;
  apiKey: string;
  expectedEnvironment?: 'test' | 'production';
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface CanonicalRegularItemInput {
  number: number;
  nbs: string;
  cst: string;
  tax_classification: string;
  tax_base: number;
  quantity?: number;
  unit?: string;
  nominal_rates?: {
    cbs: number;
    ibs_state: number;
    ibs_municipal: number;
  };
}

export interface CanonicalRegularInput {
  operation_id: string;
  effective_at: string;
  municipality_code: string;
  uf: string;
  document_kind: 'nfse';
  items: CanonicalRegularItemInput[];
}

export interface CanonicalSimplesItemInput {
  number: number;
  activity_code: string;
  tax_classification: string;
  tax_base: number;
  selective_tax_amount: number;
  ibs_effective_rate?: number;
  cbs_effective_rate?: number;
}

export interface CanonicalSimplesActivityLookupInput {
  activity_code: string;
  effective_date: string;
  document_kind: 'nfe' | 'nfce' | 'nfse';
  tax_classification: string;
}

export interface CanonicalSimplesActivityCompatibility {
  activity_code: string;
  effective_date: string;
  document_kind: 'nfe' | 'nfce' | 'nfse';
  tax_classification: string;
  environment: 'test' | 'production';
  compatible: boolean;
  official: {
    available: boolean;
    admissible_on_document: boolean;
    compatible_with_tax_classification: boolean;
    factor_r_subject: boolean;
    annex_without_factor_r: string | null;
    annex_with_factor_r: string | null;
    admissible_documents: string[];
  };
  source: {
    authority: 'receita-federal-open-source-engine';
    engine_id: string;
    repository: string;
    release: string;
    commit: string;
    mode: string;
    checked_at: string;
  };
  policy: {
    rates_inferred: false;
    calculation_executed: false;
    financial_action_allowed: false;
    issuance_binding_allowed: false;
  };
}

export interface CanonicalSimplesInput {
  operation_id: string;
  effective_date: string;
  document_kind: 'nfe' | 'nfce' | 'nfse';
  crt: '1' | '2' | '3' | '4';
  ibs_cbs_regime_type?: '1' | '2';
  government_entity_type?: '1' | '2' | '3' | '4';
  items: CanonicalSimplesItemInput[];
}

export interface CanonicalFiscalDecision {
  decision_id: string;
  decision_kind: 'rtc_calculation';
  status: 'resolved' | 'requires_input' | 'unsupported';
  regime: 'regular' | 'simples';
  environment: 'test' | 'production';
  authoritative: boolean;
  reference_only: boolean;
  assessment?: {
    response_valid?: boolean;
    all_items_usable?: boolean;
    authoritative_eligible?: boolean;
    simulation_only?: boolean;
    counts?: Record<string, number>;
  };
  freshness?: unknown;
  engine?: unknown;
  calculation?: unknown;
  sources?: unknown[];
  policy?: {
    ai_authoritative?: boolean;
    http_success_is_fiscal_success?: boolean;
    issuance_binding_allowed?: boolean;
  };
}

export type FiscalBatchExecution = 'validate' | 'calculate';

export interface FiscalBatchRowResult {
  operation_id: string;
  status: 'valid' | 'calculated' | 'requires_input' | 'unsupported' | 'engine_unavailable' | 'failed';
  decision_id?: string;
  authoritative?: boolean;
  reference_only: boolean;
  error_code?: string;
}

export interface FiscalBatchResponse {
  regime: 'regular' | 'simples';
  execution: FiscalBatchExecution;
  rows: FiscalBatchRowResult[];
  counts: Record<string, number>;
  total: number;
  policy: {
    partial_results?: boolean;
    zero_tax_on_error?: boolean;
    financial_action_allowed?: boolean;
    issuance_binding_allowed?: boolean;
  };
}

export interface AgentSafeFiscalSummary {
  decision_id: string;
  decision_kind: 'rtc_calculation';
  effective_at: string;
  status: 'resolved' | 'requires_input' | 'unsupported';
  regime: 'regular' | 'simples';
  environment: 'test' | 'production';
  use: 'authoritative_calculation_only' | 'reference_only' | 'review_required';
  authoritative: boolean;
  reference_only: boolean;
  next_action: 'collect_or_correct_fiscal_inputs' | 'route_to_manual_fiscal_review' | 'explain_calculation_only_no_execution' | 'explain_reference_only_no_execution';
  message: { locale: 'pt-BR'; text: string };
  policy: {
    ai_authoritative: false;
    financial_action_allowed: false;
    issuance_binding_allowed: false;
    raw_fiscal_payload_exposed: false;
    raw_document_content_exposed: false;
    taxpayer_pii_exposed: false;
  };
  assessment?: unknown;
  freshness?: unknown;
  engine?: unknown;
}



export interface FiscalReadinessProof {
  proof_version: 'pilot-readiness-v1';
  company: { id: string };
  environment: 'test' | 'production';
  effective_at: string | null;
  fiscal_status: string;
  onboarding_status: string | null;
  route: unknown;
  readiness: {
    homologation_ready: boolean;
    unresolved_requirements: string[];
    stages: Array<{ id: string | null; status: string | null }>;
  };
  evidence_presence: {
    onboarding: boolean;
    preflight: boolean;
  };
  next_action: unknown;
  authorization_boundary: {
    read_only: true;
    portal_can_issue_invoice: false;
    portal_can_transmit_fiscal_document: false;
    portal_can_enable_live_runtime: false;
    portal_can_grant_transmission_permit: false;
    customer_api_key_can_bypass_one_shot_permit: false;
    one_shot_test_transmission_permit_required_for_first_real_attempt: true;
  };
  checked_at: string;
}

export interface FiscalDecisionSafety {
  use: FiscalDecisionUse;
  financial_action_allowed: false;
  issuance_binding_allowed: false;
  reason: string;
}

export class TaxAgentFiscalClientError extends Error {
  constructor(
    public readonly code: 'invalid_config' | 'timeout' | 'network' | 'http_error' | 'invalid_response',
    public readonly httpStatus?: number,
  ) {
    super(`TaxAgent fiscal client error: ${code}`);
    this.name = 'TaxAgentFiscalClientError';
  }
}

function normalizeBaseUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new TaxAgentFiscalClientError('invalid_config'); }
  if (url.username || url.password) throw new TaxAgentFiscalClientError('invalid_config');
  if (!['http:', 'https:'].includes(url.protocol)) throw new TaxAgentFiscalClientError('invalid_config');
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !loopback) throw new TaxAgentFiscalClientError('invalid_config');
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

function endpoint(base: URL, path: string, query?: Record<string, string>): URL {
  const url = new URL(base.toString());
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  url.search = '';
  if (query) for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  url.hash = '';
  return url;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function assessFiscalDecisionSafety(decision: CanonicalFiscalDecision): FiscalDecisionSafety {
  if (decision.decision_kind !== 'rtc_calculation') {
    return {
      use: 'review_required',
      financial_action_allowed: false,
      issuance_binding_allowed: false,
      reason: 'unexpected_decision_kind',
    };
  }
  if (decision.status !== 'resolved') {
    return {
      use: 'review_required',
      financial_action_allowed: false,
      issuance_binding_allowed: false,
      reason: decision.status,
    };
  }
  if (decision.authoritative === true && decision.reference_only === false) {
    return {
      use: 'authoritative',
      financial_action_allowed: false,
      issuance_binding_allowed: false,
      reason: 'authoritative_tax_calculation_only',
    };
  }
  return {
    use: 'reference_only',
    financial_action_allowed: false,
    issuance_binding_allowed: false,
    reason: 'not_authoritative',
  };
}

export class TaxAgentFiscalClient {
  private readonly baseUrl: URL;
  private readonly apiKey: string;
  private readonly expectedEnvironment?: 'test' | 'production';
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: TaxAgentFiscalClientConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.apiKey = String(config.apiKey ?? '').trim();
    if (!this.apiKey) throw new TaxAgentFiscalClientError('invalid_config');
    if (config.expectedEnvironment !== undefined && !['test', 'production'].includes(config.expectedEnvironment)) {
      throw new TaxAgentFiscalClientError('invalid_config');
    }
    this.expectedEnvironment = config.expectedEnvironment;
    this.timeoutMs = config.timeoutMs ?? 15_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 60_000) {
      throw new TaxAgentFiscalClientError('invalid_config');
    }
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async status(): Promise<Record<string, unknown>> {
    return this.request('GET', '/v1/rtc/official/status');
  }

  async freshness(): Promise<Record<string, unknown>> {
    return this.request('GET', '/v1/rtc/official/freshness');
  }

  async simulatorReadiness(): Promise<Record<string, unknown>> {
    return this.request('GET', '/v1/rtc/simulator/readiness');
  }

  async validateRegular(input: CanonicalRegularInput): Promise<Record<string, unknown>> {
    return this.request('POST', '/v1/rtc/simulator/regular/validate', input);
  }

  async validateSimples(input: CanonicalSimplesInput): Promise<Record<string, unknown>> {
    return this.request('POST', '/v1/rtc/simulator/simples/validate', input);
  }

  async batchRegular(execution: FiscalBatchExecution, rows: CanonicalRegularInput[]): Promise<FiscalBatchResponse> {
    return this.requestBatch('/v1/rtc/simulator/regular/batch', { execution, rows }, 'regular', execution);
  }

  async batchSimples(execution: FiscalBatchExecution, rows: CanonicalSimplesInput[]): Promise<FiscalBatchResponse> {
    return this.requestBatch('/v1/rtc/simulator/simples/batch', { execution, rows }, 'simples', execution);
  }


  async fiscalReadinessProof(companyId: string): Promise<FiscalReadinessProof> {
    const id = String(companyId ?? '').trim();
    if (!id || id.includes('/') || id.includes('?') || id.includes('#')) throw new TaxAgentFiscalClientError('invalid_config');
    const value = await this.request('GET', `/v1/portal/companies/${encodeURIComponent(id)}/fiscal/proof`);
    const company = value.company;
    const readiness = value.readiness;
    const evidencePresence = value.evidence_presence;
    const boundary = value.authorization_boundary;
    if (
      value.proof_version !== 'pilot-readiness-v1'
      || !isObject(company)
      || company.id !== id
      || !this.environmentAccepted(value.environment)
      || typeof value.fiscal_status !== 'string'
      || !isObject(readiness)
      || typeof readiness.homologation_ready !== 'boolean'
      || !Array.isArray(readiness.unresolved_requirements)
      || !readiness.unresolved_requirements.every((item) => typeof item === 'string')
      || !Array.isArray(readiness.stages)
      || !readiness.stages.every((stage) => isObject(stage) && (stage.id === null || typeof stage.id === 'string') && (stage.status === null || typeof stage.status === 'string'))
      || !isObject(evidencePresence)
      || typeof evidencePresence.onboarding !== 'boolean'
      || typeof evidencePresence.preflight !== 'boolean'
      || !isObject(boundary)
      || boundary.read_only !== true
      || boundary.portal_can_issue_invoice !== false
      || boundary.portal_can_transmit_fiscal_document !== false
      || boundary.portal_can_enable_live_runtime !== false
      || boundary.portal_can_grant_transmission_permit !== false
      || boundary.customer_api_key_can_bypass_one_shot_permit !== false
      || boundary.one_shot_test_transmission_permit_required_for_first_real_attempt !== true
      || typeof value.checked_at !== 'string'
    ) {
      throw new TaxAgentFiscalClientError('invalid_response');
    }
    return value as unknown as FiscalReadinessProof;
  }

  async agentSummary(decisionId: string): Promise<AgentSafeFiscalSummary> {
    const id = String(decisionId ?? '').trim();
    if (!id || id.includes('/') || id.includes('?') || id.includes('#')) throw new TaxAgentFiscalClientError('invalid_config');
    const value = await this.request('GET', `/v1/tax/decisions/${encodeURIComponent(id)}/agent-summary`);
    if (
      value.decision_kind !== 'rtc_calculation'
      || typeof value.decision_id !== 'string'
      || !['resolved', 'requires_input', 'unsupported'].includes(String(value.status))
      || !['regular', 'simples'].includes(String(value.regime))
      || !this.environmentAccepted(value.environment)
      || !['authoritative_calculation_only', 'reference_only', 'review_required'].includes(String(value.use))
      || !['collect_or_correct_fiscal_inputs', 'route_to_manual_fiscal_review', 'explain_calculation_only_no_execution', 'explain_reference_only_no_execution'].includes(String(value.next_action))
      || typeof value.authoritative !== 'boolean'
      || typeof value.reference_only !== 'boolean'
      || !isObject(value.message)
      || value.message.locale !== 'pt-BR'
      || typeof value.message.text !== 'string'
      || !isObject(value.policy)
      || value.policy.ai_authoritative !== false
      || value.policy.financial_action_allowed !== false
      || value.policy.issuance_binding_allowed !== false
      || value.policy.raw_fiscal_payload_exposed !== false
      || value.policy.raw_document_content_exposed !== false
      || value.policy.taxpayer_pii_exposed !== false
    ) {
      throw new TaxAgentFiscalClientError('invalid_response');
    }
    return value as unknown as AgentSafeFiscalSummary;
  }

  async simplesActivityCompatibility(input: CanonicalSimplesActivityLookupInput): Promise<CanonicalSimplesActivityCompatibility> {
    const activityCode = String(input.activity_code ?? '').trim();
    const effectiveDate = String(input.effective_date ?? '').trim();
    const documentKind = input.document_kind;
    const taxClassification = String(input.tax_classification ?? '').trim();
    if (
      !/^\d{2}$/.test(activityCode)
      || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)
      || !['nfe', 'nfce', 'nfse'].includes(String(documentKind))
      || !/^\d{6}$/.test(taxClassification)
    ) {
      throw new TaxAgentFiscalClientError('invalid_config');
    }
    const value = await this.request(
      'GET',
      `/v1/rtc/canonical/simples/activities/${encodeURIComponent(activityCode)}`,
      undefined,
      {
        effective_date: effectiveDate,
        document_kind: documentKind,
        tax_classification: taxClassification,
      },
    );
    const official = value.official;
    const source = value.source;
    const policy = value.policy;
    if (
      value.activity_code !== activityCode
      || value.effective_date !== effectiveDate
      || value.document_kind !== documentKind
      || value.tax_classification !== taxClassification
      || !this.environmentAccepted(value.environment)
      || typeof value.compatible !== 'boolean'
      || !isObject(official)
      || typeof official.available !== 'boolean'
      || typeof official.admissible_on_document !== 'boolean'
      || typeof official.compatible_with_tax_classification !== 'boolean'
      || typeof official.factor_r_subject !== 'boolean'
      || !(official.annex_without_factor_r === null || typeof official.annex_without_factor_r === 'string')
      || !(official.annex_with_factor_r === null || typeof official.annex_with_factor_r === 'string')
      || !Array.isArray(official.admissible_documents)
      || !official.admissible_documents.every((item) => typeof item === 'string')
      || !isObject(source)
      || source.authority !== 'receita-federal-open-source-engine'
      || typeof source.engine_id !== 'string'
      || typeof source.repository !== 'string'
      || typeof source.release !== 'string'
      || typeof source.commit !== 'string'
      || typeof source.mode !== 'string'
      || typeof source.checked_at !== 'string'
      || !isObject(policy)
      || policy.rates_inferred !== false
      || policy.calculation_executed !== false
      || policy.financial_action_allowed !== false
      || policy.issuance_binding_allowed !== false
    ) {
      throw new TaxAgentFiscalClientError('invalid_response');
    }
    return value as unknown as CanonicalSimplesActivityCompatibility;
  }

  async calculateRegular(input: CanonicalRegularInput): Promise<CanonicalFiscalDecision> {
    return this.requestDecision('/v1/rtc/canonical/regular/calculate', input);
  }

  async calculateSimples(input: CanonicalSimplesInput): Promise<CanonicalFiscalDecision> {
    return this.requestDecision('/v1/rtc/canonical/simples/calculate', input);
  }

  private async requestBatch(
    path: string,
    body: unknown,
    regime: 'regular' | 'simples',
    execution: FiscalBatchExecution,
  ): Promise<FiscalBatchResponse> {
    const value = await this.request('POST', path, body);
    if (
      value.regime !== regime
      || value.execution !== execution
      || !Array.isArray(value.rows)
      || typeof value.counts !== 'object'
      || typeof value.total !== 'number'
      || !isObject(value.policy)
      || value.policy.financial_action_allowed !== false
      || value.policy.issuance_binding_allowed !== false
    ) {
      throw new TaxAgentFiscalClientError('invalid_response');
    }
    for (const row of value.rows) {
      if (
        !isObject(row)
        || typeof row.operation_id !== 'string'
        || !['valid', 'calculated', 'requires_input', 'unsupported', 'engine_unavailable', 'failed'].includes(String(row.status))
        || typeof row.reference_only !== 'boolean'
      ) {
        throw new TaxAgentFiscalClientError('invalid_response');
      }
    }
    return value as unknown as FiscalBatchResponse;
  }

  private async requestDecision(path: string, body: unknown): Promise<CanonicalFiscalDecision> {
    const value = await this.request('POST', path, body);
    if (
      typeof value.decision_id !== 'string'
      || value.decision_kind !== 'rtc_calculation'
      || !['resolved', 'requires_input', 'unsupported'].includes(String(value.status))
      || !['regular', 'simples'].includes(String(value.regime))
      || !this.environmentAccepted(value.environment)
      || typeof value.authoritative !== 'boolean'
      || typeof value.reference_only !== 'boolean'
    ) {
      throw new TaxAgentFiscalClientError('invalid_response');
    }
    return value as unknown as CanonicalFiscalDecision;
  }

  private environmentAccepted(value: unknown): boolean {
    if (!['test', 'production'].includes(String(value))) return false;
    return this.expectedEnvironment === undefined || value === this.expectedEnvironment;
  }

  private async request(method: 'GET' | 'POST', path: string, body?: unknown, query?: Record<string, string>): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const handle = setTimeout(() => controller.abort(), this.timeoutMs);
    handle.unref?.();
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(endpoint(this.baseUrl, path, query), {
          method,
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${this.apiKey}`,
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            'user-agent': 'TaxAgent-Shared-Fiscal-Client/1.0',
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          redirect: 'error',
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) throw new TaxAgentFiscalClientError('timeout');
        throw new TaxAgentFiscalClientError('network');
      }

      if (!response.ok) throw new TaxAgentFiscalClientError('http_error', response.status);

      let parsed: unknown;
      try { parsed = await response.json(); }
      catch { throw new TaxAgentFiscalClientError('invalid_response'); }
      if (!isObject(parsed)) throw new TaxAgentFiscalClientError('invalid_response');
      return parsed;
    } finally {
      clearTimeout(handle);
    }
  }
}
