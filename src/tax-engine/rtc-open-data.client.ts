import { Injectable } from '@nestjs/common';
import { FiscalEngineError } from '../fiscal-core/fiscal-engine.error';

export interface OpenDataResult { url: string; payload: unknown; fetchedAt: string }

@Injectable()
export class RtcOpenDataClient {
  getVersion(): Promise<OpenDataResult> { return this.get('/calculadora/dados-abertos/versao'); }
  getNbsList(): Promise<OpenDataResult> { return this.get('/calculadora/dados-abertos/nbs/lista'); }
  getCbsIbsClassifications(): Promise<OpenDataResult> { return this.get('/calculadora/dados-abertos/classificacoes-tributarias/cbs-ibs'); }
  getClassificationForNfse(cClassTrib: string): Promise<OpenDataResult> { return this.get(`/calculadora/dados-abertos/classificacoes-tributarias/cbs-ibs/NFSE/${encodeURIComponent(cClassTrib)}`); }
  getClassificationsByCst(cst: string): Promise<OpenDataResult> { return this.get(`/calculadora/dados-abertos/classificacoes-tributarias/cbs-ibs/${encodeURIComponent(cst)}`); }
  getClassificationsByNbs(nbs: string): Promise<OpenDataResult> {
    const template = process.env.RTC_CLASSIFICATIONS_BY_NBS_PATH_TEMPLATE ?? '/calculadora/dados-abertos/classificacoes-tributarias/nbs?nbs={nbs}';
    return this.get(template.replace('{nbs}', encodeURIComponent(nbs)));
  }
  getUnionRates(): Promise<OpenDataResult> { return this.get('/calculadora/dados-abertos/aliquota-uniao'); }
  getUfRates(): Promise<OpenDataResult> { return this.get('/calculadora/dados-abertos/aliquota-uf'); }
  getMunicipalityRates(): Promise<OpenDataResult> { return this.get('/calculadora/dados-abertos/aliquota-municipio'); }

  private async get(path: string): Promise<OpenDataResult> {
    const base = process.env.RTC_OPEN_DATA_BASE_URL ?? 'https://piloto-cbs.tributos.gov.br/servico/calculadora-consumo/api';
    const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
    let response: Response;
    try {
      response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'TaxAgent-TaxEngine/0.9' }, redirect: 'error', signal: AbortSignal.timeout(Number(process.env.RTC_REQUEST_TIMEOUT_MS ?? 15_000)) });
    } catch (error) {
      throw new FiscalEngineError('RTC_OPEN_DATA_NETWORK', error instanceof Error ? error.message : 'RTC open-data network error', true);
    }
    const raw = await response.text();
    let payload: unknown;
    try { payload = raw ? JSON.parse(raw) : null; }
    catch { throw new FiscalEngineError('RTC_OPEN_DATA_NON_JSON', `RTC open-data returned non-JSON HTTP ${response.status}: ${raw.slice(0, 500)}`, response.status >= 500); }
    if (response.status >= 500 || response.status === 408 || response.status === 429) throw new FiscalEngineError('RTC_OPEN_DATA_TRANSIENT', `RTC open-data HTTP ${response.status}`, true, payload);
    if (!response.ok) throw new FiscalEngineError('RTC_OPEN_DATA_HTTP', `RTC open-data HTTP ${response.status}`, false, payload);
    return { url: url.toString(), payload, fetchedAt: new Date().toISOString() };
  }
}
