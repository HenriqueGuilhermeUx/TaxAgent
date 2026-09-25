import { Injectable } from '@nestjs/common';
import { request } from 'node:https';
import { FiscalEngineError } from '../fiscal-core/fiscal-engine.error';

interface IbgeMunicipalityPayload {
  id?: number;
  nome?: string;
}

export interface IbgeMunicipality {
  cityCode: string;
  name: string;
}

@Injectable()
export class IbgeLocationsClient {
  private readonly stateCache = new Map<string, { expiresAt: number; municipalities: IbgeMunicipality[] }>();

  async municipalitiesByState(state: string): Promise<IbgeMunicipality[]> {
    const uf = state.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(uf)) throw new FiscalEngineError('TA_IBGE_STATE_INVALID', 'IBGE state must be a two-letter UF', false);
    const cached = this.stateCache.get(uf);
    if (cached && cached.expiresAt > Date.now()) return cached.municipalities;

    const url = new URL(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios`);
    const payload = await this.getJson(url);
    if (!Array.isArray(payload)) throw new FiscalEngineError('TA_IBGE_RESPONSE_INVALID', 'IBGE municipality response is not an array', true);

    const municipalities = (payload as IbgeMunicipalityPayload[])
      .filter((row) => Number.isInteger(row.id) && typeof row.nome === 'string' && row.nome.trim().length > 0)
      .map((row) => ({ cityCode: String(row.id), name: String(row.nome) }));
    if (municipalities.length === 0) throw new FiscalEngineError('TA_IBGE_RESPONSE_EMPTY', `IBGE returned no municipalities for ${uf}`, true);

    this.stateCache.set(uf, { expiresAt: Date.now() + 24 * 60 * 60 * 1000, municipalities });
    return municipalities;
  }

  private getJson(url: URL): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const req = request({
        protocol: url.protocol,
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: { accept: 'application/json', 'user-agent': 'TaxAgent-Coverage/0.12', connection: 'close' },
        rejectUnauthorized: true,
        timeout: 15_000,
        minVersion: 'TLSv1.2',
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const status = res.statusCode ?? 500;
          const raw = Buffer.concat(chunks).toString('utf8');
          if (status < 200 || status >= 300) {
            reject(new FiscalEngineError('TA_IBGE_HTTP', `IBGE municipality lookup HTTP ${status}`, status >= 500 || status === 408 || status === 429));
            return;
          }
          try { resolve(JSON.parse(raw)); }
          catch { reject(new FiscalEngineError('TA_IBGE_RESPONSE_INVALID', 'IBGE municipality lookup returned invalid JSON', true)); }
        });
      });
      req.on('timeout', () => req.destroy(new Error('IBGE municipality lookup timeout')));
      req.on('error', (error) => reject(error instanceof FiscalEngineError ? error : new FiscalEngineError('TA_IBGE_NETWORK', error.message, true)));
      req.end();
    });
  }
}
