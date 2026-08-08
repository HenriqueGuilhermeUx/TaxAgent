import { Injectable } from '@nestjs/common';
import { gunzipSync, gzipSync } from 'node:zlib';
import { request } from 'node:https';
import { CertificateMaterial } from '../../certificates/certificate-vault.service';
import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';
import { FiscalEnvironment } from '../../fiscal-core/fiscal.types';

export interface NationalIssueResponse {
  chaveAcesso?: string;
  idDps?: string;
  idDPS?: string;
  nfseXmlGZipB64?: string;
  erros?: Array<{ Codigo?: string; Descricao?: string; Complemento?: string }>;
  alertas?: unknown;
  [key: string]: unknown;
}

@Injectable()
export class NfseNationalClient {
  async issue(environment: FiscalEnvironment, signedXml: string, certificate: CertificateMaterial): Promise<NationalIssueResponse> {
    const base = this.base(environment);
    const body = JSON.stringify({ dpsXmlGZipB64: gzipSync(Buffer.from(signedXml, 'utf8')).toString('base64') });
    return this.requestJson(new URL('/nfse', base.endsWith('/') ? base : `${base}/`), 'POST', body, certificate);
  }

  async getByAccessKey(environment: FiscalEnvironment, accessKey: string, certificate: CertificateMaterial): Promise<NationalIssueResponse> {
    const base = this.base(environment);
    return this.requestJson(new URL(`/nfse/${encodeURIComponent(accessKey)}`, base.endsWith('/') ? base : `${base}/`), 'GET', undefined, certificate);
  }

  async getByDpsId(environment: FiscalEnvironment, dpsId: string, certificate: CertificateMaterial): Promise<NationalIssueResponse> {
    const base = this.base(environment);
    return this.requestJson(new URL(`/dps/${encodeURIComponent(dpsId)}`, base.endsWith('/') ? base : `${base}/`), 'GET', undefined, certificate);
  }

  decodeNfseXml(response: NationalIssueResponse): string | undefined {
    if (!response.nfseXmlGZipB64) return undefined;
    return gunzipSync(Buffer.from(response.nfseXmlGZipB64, 'base64')).toString('utf8');
  }

  sanitize(response: NationalIssueResponse): NationalIssueResponse {
    return { ...response, ...(response.nfseXmlGZipB64 ? { nfseXmlGZipB64: '[stored-as-fiscal-document]' } : {}) };
  }

  private base(environment: FiscalEnvironment): string {
    const base = environment === 'production' ? process.env.NFSE_PRODUCTION_BASE_URL : process.env.NFSE_TEST_BASE_URL;
    if (!base) throw new FiscalEngineError('TA_NFSE_ENDPOINT_MISSING', `NFS-e base URL not configured for ${environment}`, false);
    return base;
  }

  private requestJson(url: URL, method: 'GET' | 'POST', body: string | undefined, certificate: CertificateMaterial): Promise<NationalIssueResponse> {
    return new Promise((resolve, reject) => {
      const req = request({
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method,
        pfx: certificate.pfx,
        passphrase: certificate.password,
        rejectUnauthorized: true,
        timeout: 30_000,
        headers: {
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {}),
          'user-agent': 'TaxAgent/0.5',
        },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed: NationalIssueResponse;
          try {
            parsed = raw ? JSON.parse(raw) as NationalIssueResponse : {};
          } catch {
            return reject(new FiscalEngineError('NFSE_NON_JSON_RESPONSE', `NFS-e returned non-JSON response (${res.statusCode}): ${raw.slice(0, 500)}`, (res.statusCode ?? 500) >= 500));
          }
          const status = res.statusCode ?? 500;
          if (status >= 500 || status === 408 || status === 429) {
            return reject(new FiscalEngineError('NFSE_TRANSIENT_HTTP', `NFS-e HTTP ${status}`, true, parsed));
          }
          if (status >= 400 && !parsed.erros?.length) {
            return reject(new FiscalEngineError('NFSE_HTTP_ERROR', `NFS-e HTTP ${status}: ${raw.slice(0, 1000)}`, false, parsed));
          }
          resolve(parsed);
        });
      });
      req.on('timeout', () => req.destroy(new FiscalEngineError('NFSE_TIMEOUT', 'NFS-e request timeout', true)));
      req.on('error', (error) => {
        if (error instanceof FiscalEngineError) return reject(error);
        reject(new FiscalEngineError('NFSE_NETWORK_ERROR', error.message, true));
      });
      if (body) req.write(body);
      req.end();
    });
  }
}
