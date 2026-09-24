import { Injectable } from '@nestjs/common';
import { FiscalEngineError } from '../fiscal-core/fiscal-engine.error';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { DatabaseService } from '../database/database.service';
import { MunicipalParametersClient } from './municipal-parameters.client';

export type MunicipalIssueRoute = 'national-direct' | 'municipal-provider' | 'unknown';

export interface MunicipalCapability {
  cityCode: string;
  environment: FiscalEnvironment;
  nationalStandard: boolean;
  nationalPublicIssuer: boolean;
  route: MunicipalIssueRoute;
  provider: 'nfse-national' | 'giss' | 'unknown';
  source: 'official-national-parameters' | 'taxagent-observed-official-rejection' | 'official-regime-rule';
  checkedAt: string;
  evidence?: unknown;
}

@Injectable()
export class MunicipalCapabilityService {
  constructor(private readonly db: DatabaseService, private readonly client: MunicipalParametersClient) {}

  async resolve(cityCode: string, environment: FiscalEnvironment, taxpayer: { taxRegime?: string; effectiveAt?: string } = {}): Promise<MunicipalCapability> {
    if (!/^\d{7}$/.test(cityCode)) throw new FiscalEngineError('TA_CITY_CODE_INVALID', 'Municipality IBGE code must contain 7 digits', false);

    const regime = String(taxpayer.taxRegime ?? '').trim().toLowerCase();
    const effectiveDate = (taxpayer.effectiveAt ?? new Date().toISOString()).slice(0, 10);

    // CGSN national rule: from 2026-09-01, ME/EPP optantes do Simples Nacional
    // must use the National NFS-e Issuer. This is a taxpayer-regime rule, not a
    // municipality-specific inference, so it takes precedence over legacy local routing.
    if (['simples', 'simples_nacional'].includes(regime) && effectiveDate >= '2026-09-01') {
      return {
        cityCode, environment, nationalStandard: true, nationalPublicIssuer: true,
        route: 'national-direct', provider: 'nfse-national',
        source: 'official-regime-rule', checkedAt: new Date().toISOString(),
        evidence: { rule: 'simples_nacional_national_issuer', effective_from: '2026-09-01', tax_regime: regime },
      };
    }

    // E0039 was observed from SEFIN for Santos in Produção Restrita for a taxpayer
    // not covered by the mandatory Simples national-issuer rule above. Santos participates
    // in the national ecosystem but otherwise remains routed to its municipal provider.
    if (cityCode === '3548500') {
      return {
        cityCode, environment, nationalStandard: true, nationalPublicIssuer: false,
        route: 'municipal-provider', provider: 'giss',
        source: 'taxagent-observed-official-rejection', checkedAt: new Date().toISOString(),
        evidence: { code: 'E0039', meaning: 'municipality_not_parametrized_for_national_public_issuer' },
      };
    }

    const cached = await this.db.query<{ supported: boolean; payload: unknown; checked_at: Date }>(
      `SELECT supported, payload, checked_at FROM municipality_capabilities
       WHERE city_code=$1 AND environment=$2 AND provider='nfse-national' AND expires_at > NOW()`,
      [cityCode, environment],
    );
    let check: { supported: boolean; payload: unknown };
    let checkedAt = new Date();
    if (cached.rows[0]) {
      check = cached.rows[0];
      checkedAt = cached.rows[0].checked_at;
    } else {
      const fresh = await this.client.getConvention(environment, cityCode);
      check = fresh;
      await this.db.query(
        `INSERT INTO municipality_capabilities(city_code, environment, provider, supported, payload, checked_at, expires_at)
         VALUES ($1,$2,'nfse-national',$3,$4::jsonb,NOW(),NOW()+INTERVAL '24 hours')
         ON CONFLICT(city_code, environment, provider)
         DO UPDATE SET supported=EXCLUDED.supported, payload=EXCLUDED.payload, checked_at=NOW(), expires_at=EXCLUDED.expires_at`,
        [cityCode, environment, fresh.supported, JSON.stringify(fresh.payload ?? null)],
      );
    }

    if (!check.supported) return { cityCode, environment, nationalStandard: false, nationalPublicIssuer: false, route: 'unknown', provider: 'unknown', source: 'official-national-parameters', checkedAt: checkedAt.toISOString(), evidence: check.payload };

    // A successful convention lookup proves participation, but by itself does NOT prove
    // that the municipality enabled the National Public Issuer. Fail closed until a
    // product/capability flag can be established from the official payload.
    const text = JSON.stringify(check.payload ?? {}).toLowerCase();
    const explicitNationalIssuer = /emissor.{0,30}(publico|público).{0,30}(true|ativo|habilitado|1)/i.test(text)
      || /(true|ativo|habilitado|1).{0,30}emissor.{0,30}(publico|público)/i.test(text);

    return {
      cityCode, environment, nationalStandard: true, nationalPublicIssuer: explicitNationalIssuer,
      route: explicitNationalIssuer ? 'national-direct' : 'unknown',
      provider: explicitNationalIssuer ? 'nfse-national' : 'unknown',
      source: 'official-national-parameters', checkedAt: checkedAt.toISOString(), evidence: check.payload,
    };
  }
}
