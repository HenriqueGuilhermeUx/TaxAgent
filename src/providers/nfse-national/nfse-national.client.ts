import { Injectable } from '@nestjs/common';
import { gzipSync, gunzipSync } from 'node:zlib';
import { request } from 'node:https';
import { FiscalEnvironment } from '../../fiscal-core/fiscal.types';
import { CertificateMaterial } from '../../certificates/certificate-vault.service';

export interface NationalIssueResponse {
  chaveAcesso?: string;
  idDps?: string;
  nfseXmlGZipB64?: string;
  erros?: Array<{ Codigo?: string; Descricao?: string; Complemento?: string }>;
  [key: string]: unknown;
}

@Injectable()
export class NfseNationalClient {
  async issue(environment: FiscalEnvironment, signedXml: string, certificate: CertificateMaterial): Promise<NationalIssueResponse> {
    const base = environment === 'production'
      ? process.env.NFSE_PRODUCTION_BASE_URL
      : process.env.NFSE_TEST_BASE_URL;
    if (!base) throw new Error(`NFS-e base URL not configured for ${environment}`);

    const body = JSON.stringify({ dpsXmlGZipB64: gzipSync(Buffer.from(signedXml, 'utf8')).toString('base64') });
    return this.requestJson(new URL('/nfse', base.endsWith('/') ? base : `${base}/`), 'POST', body, certificate);
  }

  async getByAccessKey(environment: FiscalEnvironment, accessKey: string, certificate: CertificateMaterial): Promise<NationalIssueResponse> {
    const base = environment === 'production' ? process.env.NFSE_PRODUCTION_BASE_URL : process.env.NFSE_TEST_BASE_URL;
    if (!base) throw new Error(`NFS-e base URL not configured for ${environment}`);
    return this.requestJson(new URL(`/nfse/${encodeURIComponent(accessKey)}`, base.endsWith('/') ? base : `${base}/`), 'GET', undefined, certificate);
  }

  decodeNfseXml(response: NationalIssueResponse): string | undefined {
    if (!response.nfseXmlGZipB64) return undefined;
    return gunzipSync(Buffer.from(response.nfseXmlGZipB64, 'base64')).toString('utf8');
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
          'user-agent': 'TaxAgent/0.3',
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
            return reject(new Error(`NFS-e returned non-JSON response (${res.statusCode}): ${raw.slice(0, 500)}`));
          }
          if ((res.statusCode ?? 500) >= 400) return reject(new Error(`NFS-e HTTP ${res.statusCode}: ${raw.slice(0, 1000)}`));
          resolve(parsed);
        });
      });
      req.on('timeout', () => req.destroy(new Error('NFS-e request timeout')));
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }
}
