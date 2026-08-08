import { Injectable } from '@nestjs/common';
import { FiscalEngineError } from '../fiscal-core/fiscal-engine.error';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';

export interface ConventionCheck { supported: boolean; payload: unknown; status: number }

@Injectable()
export class MunicipalParametersClient {
  async getConvention(environment: FiscalEnvironment, cityCode: string): Promise<ConventionCheck> {
    const base = environment === 'production' ? process.env.NFSE_PRODUCTION_PARAMETERS_BASE_URL : process.env.NFSE_TEST_PARAMETERS_BASE_URL;
    if (!base) throw new FiscalEngineError('TA_PARAMETERS_ENDPOINT_MISSING', `Municipal parameters base URL not configured for ${environment}`, false);
    const template = process.env.NFSE_PARAMETERS_CONVENTION_PATH_TEMPLATE ?? '/parametrizacao/{cityCode}/convenio';
    const path = template.replace('{cityCode}', encodeURIComponent(cityCode));
    const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
    let response: Response;
    try {
      response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'TaxAgent-Router/0.6' }, signal: AbortSignal.timeout(15_000), redirect: 'error' });
    } catch (error) {
      throw new FiscalEngineError('NFSE_PARAMETERS_NETWORK', error instanceof Error ? error.message : 'Municipal parameters network error', true);
    }
    const raw = await response.text();
    let payload: unknown = raw;
    try { payload = raw ? JSON.parse(raw) : null; } catch { /* keep text */ }
    if (response.status === 404) return { supported: false, payload, status: 404 };
    if (response.status >= 500 || response.status === 408 || response.status === 429) throw new FiscalEngineError('NFSE_PARAMETERS_TRANSIENT', `Municipal parameters HTTP ${response.status}`, true, payload);
    if (!response.ok) throw new FiscalEngineError('NFSE_PARAMETERS_HTTP', `Municipal parameters HTTP ${response.status}`, false, payload);
    return { supported: true, payload, status: response.status };
  }
}
