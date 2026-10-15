import { Injectable } from '@nestjs/common';
import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';
import { FiscalEnvironment } from '../../fiscal-core/fiscal.types';

export interface PlugNotasNationalPatternSupport {
  producao?: boolean;
  homologacao?: boolean;
}

export interface PlugNotasMunicipalityMetadata {
  id: number | string;
  nome: string;
  uf: string;
  padrao?: string;
  certificado?: boolean;
  login?: boolean;
  senha?: boolean;
  upload?: boolean;
  sequencial?: boolean;
  substituicao?: boolean;
  padraoNacional?: PlugNotasNationalPatternSupport;
  [key: string]: unknown;
}

type PlugNotasMethod = 'GET' | 'POST';

const PLUGNOTAS_SANDBOX_BASE_URL = 'https://api.sandbox.plugnotas.com.br';
const PLUGNOTAS_PRODUCTION_BASE_URL = 'https://api.plugnotas.com.br';

@Injectable()
export class PlugNotasClient {
  isConfigured(environment: FiscalEnvironment): boolean {
    return Boolean(this.apiKey(environment));
  }

  async getMunicipality(environment: FiscalEnvironment, cityCode: string): Promise<PlugNotasMunicipalityMetadata | null> {
    if (!/^\d{7}$/.test(cityCode)) {
      throw new FiscalEngineError('TA_CITY_CODE_INVALID', 'Municipality IBGE code must contain 7 digits', false);
    }
    if (!this.isConfigured(environment)) return null;

    const result = await this.request<PlugNotasMunicipalityMetadata>(environment, 'GET', `/nfse/cidades/${cityCode}`, undefined, true);
    return result;
  }

  async issueNfse(environment: FiscalEnvironment, payload: unknown): Promise<unknown> {
    this.assertTransmissionEnabled(environment);
    return this.request(environment, 'POST', '/nfse', payload);
  }

  async consultNfse(environment: FiscalEnvironment, idOrProtocol: string): Promise<unknown> {
    if (!idOrProtocol.trim()) throw new FiscalEngineError('TA_PLUGNOTAS_REFERENCE_REQUIRED', 'PlugNotas note id or protocol is required', false);
    return this.request(environment, 'GET', `/nfse/consultar/${encodeURIComponent(idOrProtocol.trim())}`);
  }

  async cancelNfse(environment: FiscalEnvironment, id: string, input: { codigo?: string; motivo?: string }): Promise<unknown> {
    if (!id.trim()) throw new FiscalEngineError('TA_PLUGNOTAS_REFERENCE_REQUIRED', 'PlugNotas note id is required', false);
    this.assertTransmissionEnabled(environment);
    return this.request(environment, 'POST', `/nfse/cancelar/${encodeURIComponent(id.trim())}`, input);
  }

  private assertTransmissionEnabled(environment: FiscalEnvironment): void {
    const variable = environment === 'test'
      ? 'PLUGNOTAS_SANDBOX_TRANSMISSION_ENABLED'
      : 'PLUGNOTAS_PRODUCTION_TRANSMISSION_ENABLED';
    if (process.env[variable] !== 'true') {
      throw new FiscalEngineError(
        environment === 'test' ? 'TA_PLUGNOTAS_SANDBOX_TRANSMISSION_LOCKED' : 'TA_FISCAL_TRANSMISSION_LOCKED',
        `PlugNotas ${environment} fiscal transmission is locked; set ${variable}=true only after issuer onboarding and preflight are verified`,
        false,
      );
    }
  }

  private apiKey(environment: FiscalEnvironment): string | null {
    const raw = environment === 'test' ? process.env.PLUGNOTAS_SANDBOX_API_KEY : process.env.PLUGNOTAS_API_KEY;
    return raw?.trim() || null;
  }

  private baseUrl(environment: FiscalEnvironment): string {
    return environment === 'test' ? PLUGNOTAS_SANDBOX_BASE_URL : PLUGNOTAS_PRODUCTION_BASE_URL;
  }

  private timeoutMs(): number {
    const parsed = Number(process.env.PLUGNOTAS_HTTP_TIMEOUT_MS ?? 10000);
    return Number.isFinite(parsed) && parsed >= 1000 && parsed <= 60000 ? parsed : 10000;
  }

  private async request<T = unknown>(
    environment: FiscalEnvironment,
    method: PlugNotasMethod,
    path: string,
    body?: unknown,
    notFoundAsNull = false,
  ): Promise<T | null> {
    const apiKey = this.apiKey(environment);
    if (!apiKey) {
      throw new FiscalEngineError(
        'TA_PLUGNOTAS_NOT_CONFIGURED',
        `PlugNotas ${environment} API key is not configured`,
        false,
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      const response = await fetch(`${this.baseUrl(environment)}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.status === 404 && notFoundAsNull) return null;

      const raw = await response.text();
      const payload = raw ? this.parsePayload(raw) : null;
      if (!response.ok) {
        throw new FiscalEngineError(
          'TA_PLUGNOTAS_HTTP_ERROR',
          `PlugNotas request failed with HTTP ${response.status}`,
          response.status === 408 || response.status === 429 || response.status >= 500,
          { status: response.status, payload },
        );
      }
      return payload as T;
    } catch (error) {
      if (error instanceof FiscalEngineError) throw error;
      const aborted = error instanceof Error && error.name === 'AbortError';
      throw new FiscalEngineError(
        aborted ? 'TA_PLUGNOTAS_TIMEOUT' : 'TA_PLUGNOTAS_NETWORK_ERROR',
        aborted ? 'PlugNotas request timed out' : 'Unable to reach PlugNotas',
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private parsePayload(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw: raw.slice(0, 4000) };
    }
  }
}
