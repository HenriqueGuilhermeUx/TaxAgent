import { Injectable } from '@nestjs/common';
import { request } from 'node:https';
import { connect } from 'node:tls';
import { gunzipSync, gzipSync } from 'node:zlib';
import { CertificateMaterial } from '../../certificates/certificate-vault.service';
import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';
import { FiscalEnvironment } from '../../fiscal-core/fiscal.types';
import { resolveNfseBase } from './nfse-endpoints';

export interface NationalApiResponse {
  chaveAcesso?: string;
  idDps?: string;
  idDPS?: string;
  nfseXmlGZipB64?: string;
  eventoXmlGZipB64?: string;
  erros?: Array<{ Codigo?: string; Descricao?: string; Complemento?: string }>;
  alertas?: unknown;
  [key: string]: unknown;
}

@Injectable()
export class NfseNationalClient {
  issue(environment: FiscalEnvironment, signedXml: string, certificate: CertificateMaterial): Promise<NationalApiResponse> {
    const body = JSON.stringify({ dpsXmlGZipB64: gzipSync(Buffer.from(signedXml, 'utf8')).toString('base64') });
    return this.requestJson(new URL('/nfse', this.normalizedBase(environment)), 'POST', body, certificate);
  }
  getByAccessKey(environment: FiscalEnvironment, accessKey: string, certificate: CertificateMaterial): Promise<NationalApiResponse> {
    return this.requestJson(new URL(`/nfse/${encodeURIComponent(accessKey)}`, this.normalizedBase(environment)), 'GET', undefined, certificate);
  }
  getByDpsId(environment: FiscalEnvironment, dpsId: string, certificate: CertificateMaterial): Promise<NationalApiResponse> {
    return this.requestJson(new URL(`/dps/${encodeURIComponent(dpsId)}`, this.normalizedBase(environment)), 'GET', undefined, certificate);
  }
  registerEvent(environment: FiscalEnvironment, accessKey: string, signedXml: string, certificate: CertificateMaterial): Promise<NationalApiResponse> {
    const body = JSON.stringify({ pedidoRegistroEventoXmlGZipB64: gzipSync(Buffer.from(signedXml, 'utf8')).toString('base64') });
    return this.requestJson(new URL(`/nfse/${encodeURIComponent(accessKey)}/eventos`, this.normalizedBase(environment)), 'POST', body, certificate);
  }
  probeMutualTls(environment: FiscalEnvironment, certificate: CertificateMaterial): Promise<{ host: string; protocol: string | null; cipher: string | null; authorized: boolean }> {
    const base = new URL(this.normalizedBase(environment));
    return new Promise((resolve, reject) => {
      const socket = connect({ host: base.hostname, port: Number(base.port || 443), servername: base.hostname, pfx: certificate.pfx, passphrase: certificate.password, rejectUnauthorized: true });
      const timer = setTimeout(() => socket.destroy(new Error('mTLS handshake timeout')), 15_000);
      socket.once('secureConnect', () => {
        clearTimeout(timer);
        const cipher = socket.getCipher();
        const result = { host: base.hostname, protocol: socket.getProtocol(), cipher: cipher?.name ?? null, authorized: socket.authorized };
        socket.end();
        resolve(result);
      });
      socket.once('error', (error) => {
        clearTimeout(timer);
        reject(new FiscalEngineError('NFSE_MTLS_PROBE_FAILED', `SEFIN mTLS handshake failed: ${error.message}`, true));
      });
    });
  }
  decodeNfseXml(response: NationalApiResponse): string | undefined { return response.nfseXmlGZipB64 ? gunzipSync(Buffer.from(response.nfseXmlGZipB64, 'base64')).toString('utf8') : undefined; }
  decodeEventXml(response: NationalApiResponse): string | undefined { return response.eventoXmlGZipB64 ? gunzipSync(Buffer.from(response.eventoXmlGZipB64, 'base64')).toString('utf8') : undefined; }
  sanitize(response: NationalApiResponse): NationalApiResponse {
    return { ...response, ...(response.nfseXmlGZipB64 ? { nfseXmlGZipB64: '[stored-as-fiscal-document]' } : {}), ...(response.eventoXmlGZipB64 ? { eventoXmlGZipB64: '[stored-as-fiscal-document]' } : {}) };
  }
  private normalizedBase(environment: FiscalEnvironment): string { return resolveNfseBase(environment); }
  private requestJson(url: URL, method: 'GET' | 'POST', body: string | undefined, certificate: CertificateMaterial): Promise<NationalApiResponse> {
    return new Promise((resolve, reject) => {
      const req = request({ protocol: url.protocol, hostname: url.hostname, port: url.port || undefined, path: `${url.pathname}${url.search}`, method, pfx: certificate.pfx, passphrase: certificate.password, rejectUnauthorized: true, timeout: 30_000, headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {}), 'user-agent': 'TaxAgent/0.9' } }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed: NationalApiResponse;
          try { parsed = raw ? JSON.parse(raw) as NationalApiResponse : {}; }
          catch { return reject(new FiscalEngineError('NFSE_NON_JSON_RESPONSE', `NFS-e returned non-JSON response (${res.statusCode}): ${raw.slice(0, 500)}`, (res.statusCode ?? 500) >= 500)); }
          const status = res.statusCode ?? 500;
          if (status >= 500 || status === 408 || status === 429) return reject(new FiscalEngineError('NFSE_TRANSIENT_HTTP', `NFS-e HTTP ${status}`, true, parsed));
          if (status >= 400 && !parsed.erros?.length) return reject(new FiscalEngineError('NFSE_HTTP_ERROR', `NFS-e HTTP ${status}: ${raw.slice(0, 1000)}`, false, parsed));
          resolve(parsed);
        });
      });
      req.on('timeout', () => req.destroy(new FiscalEngineError('NFSE_TIMEOUT', 'NFS-e request timeout', true)));
      req.on('error', (error) => reject(error instanceof FiscalEngineError ? error : new FiscalEngineError('NFSE_NETWORK_ERROR', error.message, true)));
      if (body) req.write(body);
      req.end();
    });
  }
}
