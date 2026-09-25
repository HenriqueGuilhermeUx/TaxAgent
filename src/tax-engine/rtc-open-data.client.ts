import { Injectable } from '@nestjs/common';
import { FiscalEngineError } from '../fiscal-core/fiscal-engine.error';

export interface OpenDataResult { url: string; payload: unknown; fetchedAt: string }

export const DEFAULT_RTC_OPEN_DATA_BASE_URL = 'https://piloto-cbs.tributos.gov.br/servico/calculadora-consumo/api';

export function resolveRtcOpenDataUrl(
  path: string,
  base = DEFAULT_RTC_OPEN_DATA_BASE_URL,
  query: Record<string, string | number | undefined> = {},
): URL {
  // URL paths beginning with "/" replace the pathname of the base URL. The RTC
  // base intentionally contains the official API prefix, so requests must be
  // resolved relative to that prefix instead of from the host root.
  const normalizedBase = `${base.replace(/\/+$/, '')}/`;
  const normalizedPath = path.replace(/^\/+/, '');
  const url = new URL(normalizedPath, normalizedBase);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && String(value).length > 0) url.searchParams.set(key, String(value));
  }
  return url;
}

function problemDetail(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  const title = (payload as { title?: unknown }).title;
  return typeof title === 'string' && title.trim() ? title.trim() : undefined;
}

@Injectable()
export class RtcOpenDataClient {
  getVersion(): Promise<OpenDataResult> { return this.get('/calculadora/dados-abertos/versao'); }
  getNbsList(): Promise<OpenDataResult> { return this.get('/calculadora/dados-abertos/nbs/lista'); }
  getCbsIbsClassifications(effectiveAt?: string): Promise<OpenDataResult> {
    return this.get('/calculadora/dados-abertos/classificacoes-tributarias/cbs-ibs', effectiveAt ? { data: effectiveAt.slice(0, 10) } : {});
  }
  getClassificationForNfse(cClassTrib: string, effectiveAt: string): Promise<OpenDataResult> {
    const siglaDfe = process.env.RTC_NFSE_DFE_SIGLA ?? 'NFSE';
    return this.get(
      `/calculadora/dados-abertos/classificacoes-tributarias/cbs-ibs/${encodeURIComponent(siglaDfe)}/${encodeURIComponent(cClassTrib)}`,
      { data: effectiveAt.slice(0, 10) },
    );
  }
  getClassificationsByCst(cst: string, effectiveAt?: string): Promise<OpenDataResult> {
    return this.get(`/calculadora/dados-abertos/classificacoes-tributarias/cbs-ibs/${encodeURIComponent(cst)}`, effectiveAt ? { data: effectiveAt.slice(0, 10) } : {});
  }
  getClassificationsByNbs(nbs: string, effectiveAt?: string): Promise<OpenDataResult> {
    const template = process.env.RTC_CLASSIFICATIONS_BY_NBS_PATH_TEMPLATE ?? '/calculadora/dados-abertos/classificacoes-tributarias/nbs?nbs={nbs}';
    return this.get(template.replace('{nbs}', encodeURIComponent(nbs)), effectiveAt ? { data: effectiveAt.slice(0, 10) } : {});
  }
  getUnionRates(effectiveAt?: string): Promise<OpenDataResult> {
    return this.get('/calculadora/dados-abertos/aliquota-uniao', effectiveAt ? { data: effectiveAt.slice(0, 10) } : {});
  }
  getUfRates(effectiveAt?: string, codigoUf?: number): Promise<OpenDataResult> {
    return this.get('/calculadora/dados-abertos/aliquota-uf', { data: effectiveAt?.slice(0, 10), codigoUf });
  }
  getMunicipalityRates(effectiveAt?: string, codigoMunicipio?: number): Promise<OpenDataResult> {
    return this.get('/calculadora/dados-abertos/aliquota-municipio', { data: effectiveAt?.slice(0, 10), codigoMunicipio });
  }

  private async get(path: string, query: Record<string, string | number | undefined> = {}): Promise<OpenDataResult> {
    const base = process.env.RTC_OPEN_DATA_BASE_URL ?? DEFAULT_RTC_OPEN_DATA_BASE_URL;
    const url = resolveRtcOpenDataUrl(path, base, query);
    let response: Response;
    try {
      response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'TaxAgent-TaxEngine/0.12' }, redirect: 'error', signal: AbortSignal.timeout(Number(process.env.RTC_REQUEST_TIMEOUT_MS ?? 15_000)) });
    } catch (error) {
      throw new FiscalEngineError('RTC_OPEN_DATA_NETWORK', error instanceof Error ? error.message : 'RTC open-data network error', true);
    }
    const raw = await response.text();
    let payload: unknown;
    try { payload = raw ? JSON.parse(raw) : null; }
    catch { throw new FiscalEngineError('RTC_OPEN_DATA_NON_JSON', `RTC open-data returned non-JSON HTTP ${response.status}: ${raw.slice(0, 500)}`, response.status >= 500); }
    const detail = problemDetail(payload);
    const suffix = detail ? `: ${detail}` : '';
    if (response.status >= 500 || response.status === 408 || response.status === 429) throw new FiscalEngineError('RTC_OPEN_DATA_TRANSIENT', `RTC open-data HTTP ${response.status}${suffix}`, true, payload);
    if (!response.ok) throw new FiscalEngineError('RTC_OPEN_DATA_HTTP', `RTC open-data HTTP ${response.status}${suffix}`, false, payload);
    return { url: url.toString(), payload, fetchedAt: new Date().toISOString() };
  }
}
