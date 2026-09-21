import { Injectable } from '@nestjs/common';
import { FiscalEngineError } from '../fiscal-core/fiscal-engine.error';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { request } from 'node:https';

export interface ConventionCheck { supported: boolean; payload: unknown; status: number }

@Injectable()
export class MunicipalParametersClient {
  async getConvention(environment: FiscalEnvironment, cityCode: string): Promise<ConventionCheck> {
    const base = environment === 'production'
      ? (process.env.NFSE_PRODUCTION_PARAMETERS_BASE_URL ?? 'https://adn.nfse.gov.br')
      : (process.env.NFSE_TEST_PARAMETERS_BASE_URL ?? 'https://adn.producaorestrita.nfse.gov.br');
    const template = process.env.NFSE_PARAMETERS_CONVENTION_PATH_TEMPLATE ?? '/parametrizacao/{cityCode}/convenio';
    const path = template.replace('{cityCode}', encodeURIComponent(cityCode));
    const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
    const { status, raw } = await this.getJson(url);
    let payload: unknown = raw;
    try { payload = raw ? JSON.parse(raw) : null; } catch { /* keep text */ }
    if (status === 404) return { supported: false, payload, status };
    if (status >= 500 || status === 408 || status === 429) throw new FiscalEngineError('NFSE_PARAMETERS_TRANSIENT', `Municipal parameters HTTP ${status}`, true, payload);
    if (status < 200 || status >= 300) throw new FiscalEngineError('NFSE_PARAMETERS_HTTP', `Municipal parameters HTTP ${status}`, false, payload);
    return { supported: true, payload, status };
  }
  private getJson(url: URL): Promise<{ status: number; raw: string }> {
    return new Promise((resolve, reject) => {
      const req = request({
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: { accept: 'application/json', 'user-agent': 'TaxAgent-Router/0.12', connection: 'close' },
        rejectUnauthorized: true,
        timeout: 15_000,
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 500, raw: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('timeout', () => req.destroy(new Error('Municipal parameters request timeout')));
      req.on('error', (error) => reject(new FiscalEngineError('NFSE_PARAMETERS_NETWORK', error.message, true)));
      req.end();
    });
  }
}
