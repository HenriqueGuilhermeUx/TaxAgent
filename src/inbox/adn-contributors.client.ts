import { Injectable } from '@nestjs/common';
import { request } from 'node:https';
import { CertificateMaterial } from '../certificates/certificate-vault.service';
import { FiscalEngineError } from '../fiscal-core/fiscal-engine.error';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';

@Injectable()
export class AdnContributorsClient {
  getDfe(environment: FiscalEnvironment, nsu: string, certificate: CertificateMaterial, cnpjConsulta?: string): Promise<unknown> {
    const url = new URL(`/DFe/${encodeURIComponent(nsu)}`, this.base(environment));
    if (cnpjConsulta) url.searchParams.set(process.env.ADN_CNPJ_QUERY_PARAM ?? 'cnpjConsulta', cnpjConsulta);
    return this.getJson(url, certificate);
  }

  getEvents(environment: FiscalEnvironment, accessKey: string, certificate: CertificateMaterial): Promise<unknown> {
    return this.getJson(new URL(`/NFSe/${encodeURIComponent(accessKey)}/Eventos`, this.base(environment)), certificate);
  }

  private base(environment: FiscalEnvironment): string {
    const base = environment === 'production' ? process.env.ADN_PRODUCTION_CONTRIBUTORS_BASE_URL : process.env.ADN_TEST_CONTRIBUTORS_BASE_URL;
    if (!base) throw new FiscalEngineError('TA_ADN_ENDPOINT_MISSING', `ADN contributor base URL not configured for ${environment}`, false);
    return base.endsWith('/') ? base : `${base}/`;
  }

  private getJson(url: URL, certificate: CertificateMaterial): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const req = request({
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        pfx: certificate.pfx,
        passphrase: certificate.password,
        rejectUnauthorized: true,
        timeout: 30_000,
        headers: { accept: 'application/json', 'user-agent': 'TaxAgent-ADN/0.8' },
      }, (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 20 * 1024 * 1024) return req.destroy(new FiscalEngineError('ADN_RESPONSE_TOO_LARGE', 'ADN response exceeded 20 MB', false));
          chunks.push(chunk);
        });
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed: unknown;
          try { parsed = raw ? JSON.parse(raw) : {}; }
          catch { return reject(new FiscalEngineError('ADN_NON_JSON_RESPONSE', `ADN returned non-JSON response (${res.statusCode}): ${raw.slice(0, 500)}`, (res.statusCode ?? 500) >= 500)); }
          const status = res.statusCode ?? 500;
          if (status >= 500 || status === 408 || status === 429) return reject(new FiscalEngineError('ADN_TRANSIENT_HTTP', `ADN HTTP ${status}`, true, parsed));
          if (status >= 400) return reject(new FiscalEngineError('ADN_HTTP_ERROR', `ADN HTTP ${status}`, false, parsed));
          resolve(parsed);
        });
      });
      req.on('timeout', () => req.destroy(new FiscalEngineError('ADN_TIMEOUT', 'ADN request timeout', true)));
      req.on('error', (error) => reject(error instanceof FiscalEngineError ? error : new FiscalEngineError('ADN_NETWORK_ERROR', error.message, true)));
      req.end();
    });
  }
}
