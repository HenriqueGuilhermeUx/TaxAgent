export type FiscalDecisionUse = 'authoritative' | 'reference_only' | 'review_required';

export interface TaxAgentFiscalClientConfig {
  baseUrl: string;
  apiKey: string;
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

export interface CanonicalSimplesInput {
  operation_id: string;
  effective_date: string;
  document_kind: 'nfe' | 'nfce';
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

function endpoint(base: URL, path: string): URL {
  const url = new URL(base.toString());
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  url.search = '';
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
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: TaxAgentFiscalClientConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.apiKey = String(config.apiKey ?? '').trim();
    if (!this.apiKey) throw new TaxAgentFiscalClientError('invalid_config');
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

  async calculateRegular(input: CanonicalRegularInput): Promise<CanonicalFiscalDecision> {
    return this.requestDecision('/v1/rtc/canonical/regular/calculate', input);
  }

  async calculateSimples(input: CanonicalSimplesInput): Promise<CanonicalFiscalDecision> {
    return this.requestDecision('/v1/rtc/canonical/simples/calculate', input);
  }

  private async requestDecision(path: string, body: unknown): Promise<CanonicalFiscalDecision> {
    const value = await this.request('POST', path, body);
    if (
      typeof value.decision_id !== 'string'
      || value.decision_kind !== 'rtc_calculation'
      || !['resolved', 'requires_input', 'unsupported'].includes(String(value.status))
      || !['regular', 'simples'].includes(String(value.regime))
      || typeof value.authoritative !== 'boolean'
      || typeof value.reference_only !== 'boolean'
    ) {
      throw new TaxAgentFiscalClientError('invalid_response');
    }
    return value as unknown as CanonicalFiscalDecision;
  }

  private async request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const handle = setTimeout(() => controller.abort(), this.timeoutMs);
    handle.unref?.();
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(endpoint(this.baseUrl, path), {
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
