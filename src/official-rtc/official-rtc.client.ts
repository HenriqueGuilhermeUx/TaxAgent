import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';

export type OfficialRtcEngineMode = 'off' | 'shadow' | 'official';

export function officialRtcMode(): OfficialRtcEngineMode {
  const raw = String(process.env.TAXAGENT_RTC_ENGINE_MODE ?? 'off').trim().toLowerCase();
  return raw === 'shadow' || raw === 'official' ? raw : 'off';
}

export function resolveOfficialRtcBaseUrl(raw: string | undefined): URL | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Official RTC service URL must be an absolute URL'); }
  if (url.username || url.password) throw new Error('Official RTC service URL must not contain credentials');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Official RTC service URL must use http or https');
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !loopback) throw new Error('Official RTC service URL must use https unless it is loopback');
  url.search = '';
  url.hash = '';
  return url;
}

function join(base: URL, path: string): URL {
  const normalized = new URL(base.toString());
  normalized.pathname = `${normalized.pathname.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  normalized.search = '';
  normalized.hash = '';
  return normalized;
}

@Injectable()
export class OfficialRtcClient {
  regularConfigured(): boolean { return !!resolveOfficialRtcBaseUrl(process.env.TAXAGENT_RTC_REGULAR_URL); }
  simplesConfigured(): boolean { return !!resolveOfficialRtcBaseUrl(process.env.TAXAGENT_RTC_SIMPLES_URL); }
  danfseConfigured(): boolean { return !!resolveOfficialRtcBaseUrl(process.env.TAXAGENT_RTC_DANFSE_URL); }

  async calculateRegular(payload: Record<string, unknown>, observable = true): Promise<unknown> {
    const base = this.required(process.env.TAXAGENT_RTC_REGULAR_URL, 'regular');
    return this.postJson(base, observable ? '/api/calculadora/observabilidade/regime-geral' : '/api/calculadora/regime-geral', payload);
  }

  async calculateSimples(payload: Record<string, unknown>): Promise<unknown> {
    const base = this.required(process.env.TAXAGENT_RTC_SIMPLES_URL, 'simples');
    return this.postJson(base, '/api/calculadora/observabilidade/simples-nacional', payload);
  }

  async simplesVersionStatus(): Promise<unknown> {
    const base = this.required(process.env.TAXAGENT_RTC_SIMPLES_URL, 'simples');
    return this.getJson(base, '/api/versao/status');
  }

  async renderDanfse(xml: string, state = '0', canhoto = true): Promise<Buffer> {
    const base = this.required(process.env.TAXAGENT_RTC_DANFSE_URL, 'danfse');
    const url = join(base, '/api/danfse');
    url.searchParams.set('stc', state);
    url.searchParams.set('canhoto', canhoto ? 'true' : 'false');
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/xml', accept: 'application/pdf', 'user-agent': 'TaxAgent-OfficialRTC/1.0' },
        body: xml,
        redirect: 'error',
        signal: AbortSignal.timeout(Number(process.env.TAXAGENT_RTC_REQUEST_TIMEOUT_MS ?? 20_000)),
      });
    } catch (error) {
      throw new BadGatewayException(`Official DANFSe engine network failure: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
    if (!response.ok) throw new BadGatewayException(`Official DANFSe engine HTTP ${response.status}`);
    // HTTP 200 alone is not evidence that the upstream returned a valid PDF.
    // Fail closed on HTML/JSON error pages and oversized documents.
    const maxBytes = 10 * 1024 * 1024;
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new BadGatewayException('Official DANFSe PDF exceeds the maximum allowed size');
    }
    const pdf = Buffer.from(await response.arrayBuffer());
    if (pdf.length < 8 || pdf.length > maxBytes || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BadGatewayException('Official DANFSe engine did not return a valid PDF header or size');
    }
    return pdf;
  }

  private required(raw: string | undefined, engine: string): URL {
    const url = resolveOfficialRtcBaseUrl(raw);
    if (!url) throw new ServiceUnavailableException(`Official RTC ${engine} engine is not configured`);
    return url;
  }

  private async getJson(base: URL, path: string): Promise<unknown> {
    const url = join(base, path);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json', 'user-agent': 'TaxAgent-OfficialRTC/1.0' },
        redirect: 'error',
        signal: AbortSignal.timeout(Number(process.env.TAXAGENT_RTC_REQUEST_TIMEOUT_MS ?? 20_000)),
      });
    } catch (error) {
      throw new BadGatewayException(`Official RTC engine network failure: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
    const raw = await response.text();
    let parsed: unknown = raw;
    try { parsed = raw ? JSON.parse(raw) : null; } catch {}
    if (!response.ok) throw new BadGatewayException({ message: `Official RTC engine HTTP ${response.status}`, upstream: parsed });
    return parsed;
  }

  private async postJson(base: URL, path: string, payload: Record<string, unknown>): Promise<unknown> {
    const url = join(base, path);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'TaxAgent-OfficialRTC/1.0' },
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: AbortSignal.timeout(Number(process.env.TAXAGENT_RTC_REQUEST_TIMEOUT_MS ?? 20_000)),
      });
    } catch (error) {
      throw new BadGatewayException(`Official RTC engine network failure: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
    const raw = await response.text();
    let parsed: unknown = raw;
    try { parsed = raw ? JSON.parse(raw) : null; } catch {}
    if (!response.ok) throw new BadGatewayException({ message: `Official RTC engine HTTP ${response.status}`, upstream: parsed });
    return parsed;
  }
}
