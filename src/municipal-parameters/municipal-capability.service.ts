import { Injectable } from '@nestjs/common';
import { FiscalEngineError } from '../fiscal-core/fiscal-engine.error';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { DatabaseService } from '../database/database.service';
import { MunicipalParametersClient } from './municipal-parameters.client';

export type MunicipalIssueRoute = 'national-direct' | 'municipal-provider' | 'unknown';
export type MunicipalCapabilityConfidence = 'high' | 'medium' | 'low';

export interface MunicipalCapability {
  cityCode: string;
  environment: FiscalEnvironment;
  nationalStandard: boolean;
  nationalAdnParticipant: boolean;
  nationalPublicIssuer: boolean;
  route: MunicipalIssueRoute;
  provider: 'nfse-national' | 'giss' | 'unknown';
  source: 'official-national-parameters' | 'taxagent-observed-official-rejection' | 'official-regime-rule';
  sourceUrl: string | null;
  evidenceDate: string;
  effectiveFrom: string | null;
  confidence: MunicipalCapabilityConfidence;
  checkedAt: string;
  evidence?: unknown;
}

const NATIONAL_ADHESION_MONITOR_URL = 'https://www.gov.br/nfse/pt-br/municipios/monitoramento-adesoes';
const SIMPLES_NACIONAL_SOURCE_URL = 'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/agosto/simples-nacional-nfs-e-nacional-sera-obrigatoria-para-me-e-epp-a-partir-de-1o-de-novembro-de-2026';
const SEFIN_PRODREST_BASE_URL = 'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional';

function officialConventionFlag(payload: unknown, key: 'aderenteAmbienteNacional' | 'aderenteEmissorNacional'): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const parametrosConvenio = (payload as Record<string, unknown>).parametrosConvenio;
  if (!parametrosConvenio || typeof parametrosConvenio !== 'object' || Array.isArray(parametrosConvenio)) return false;
  const value = (parametrosConvenio as Record<string, unknown>)[key];

  // Accept only exact structured affirmative values from the official convention payload.
  // Never infer capability from free text or similarly named nearby keys.
  return value === 1 || value === '1' || value === true;
}

function officialNationalIssuerEnabled(payload: unknown): boolean {
  return officialConventionFlag(payload, 'aderenteEmissorNacional');
}

function officialNationalEnvironmentEnabled(payload: unknown): boolean {
  return officialConventionFlag(payload, 'aderenteAmbienteNacional');
}

@Injectable()
export class MunicipalCapabilityService {
  constructor(private readonly db: DatabaseService, private readonly client: MunicipalParametersClient) {}

  async resolve(cityCode: string, environment: FiscalEnvironment, taxpayer: { taxRegime?: string; effectiveAt?: string } = {}): Promise<MunicipalCapability> {
    if (!/^\d{7}$/.test(cityCode)) throw new FiscalEngineError('TA_CITY_CODE_INVALID', 'Municipality IBGE code must contain 7 digits', false);

    const regime = String(taxpayer.taxRegime ?? '').trim().toLowerCase();
    const effectiveDate = (taxpayer.effectiveAt ?? new Date().toISOString()).slice(0, 10);
    const checkedAt = new Date().toISOString();

    // Resolução CGSN 191/2026 revoked the earlier 2026-09-01 deadline and moved
    // mandatory National NFS-e issuance for ME/EPP optantes do Simples Nacional
    // to 2026-11-01. Receita Federal explicitly states that issuance must use the
    // National Issuer, including ERP integration through the national API.
    if (['simples', 'simples_nacional'].includes(regime) && effectiveDate >= '2026-11-01') {
      return {
        cityCode, environment,
        nationalStandard: true,
        nationalAdnParticipant: true,
        nationalPublicIssuer: true,
        route: 'national-direct', provider: 'nfse-national',
        source: 'official-regime-rule',
        sourceUrl: SIMPLES_NACIONAL_SOURCE_URL,
        evidenceDate: '2026-08-14',
        effectiveFrom: '2026-11-01',
        confidence: 'high',
        checkedAt,
        evidence: {
          rule: 'simples_nacional_national_issuer',
          effective_from: '2026-11-01',
          tax_regime: regime,
          resolution: 'CGSN 191/2026',
          scope: 'ME/EPP optante pelo Simples Nacional',
        },
      };
    }

    // E0039 was observed from SEFIN for Santos in Produção Restrita: Santos participates
    // in the national ecosystem but is not parametrized to use the National Public Issuer
    // for the regular-regime taxpayer profile tested. Keep this explicit safety override
    // until an official capability or applicable regime rule proves otherwise.
    if (cityCode === '3548500') {
      return {
        cityCode, environment,
        nationalStandard: true,
        nationalAdnParticipant: true,
        nationalPublicIssuer: false,
        route: 'municipal-provider', provider: 'giss',
        source: 'taxagent-observed-official-rejection',
        sourceUrl: SEFIN_PRODREST_BASE_URL,
        evidenceDate: '2026-09-24',
        effectiveFrom: null,
        confidence: 'high',
        checkedAt,
        evidence: {
          code: 'E0039',
          meaning: 'municipality_not_parametrized_for_national_public_issuer',
          taxpayer_profile: 'regular',
          provider_contract: 'GISS ABRASF 2.04',
        },
      };
    }

    const cached = await this.db.query<{ supported: boolean; payload: unknown; checked_at: Date }>(
      `SELECT supported, payload, checked_at FROM municipality_capabilities
       WHERE city_code=$1 AND environment=$2 AND provider='nfse-national' AND expires_at > NOW()`,
      [cityCode, environment],
    );
    let check: { supported: boolean; payload: unknown };
    let capabilityCheckedAt = new Date();
    if (cached.rows[0]) {
      check = cached.rows[0];
      capabilityCheckedAt = cached.rows[0].checked_at;
    } else {
      const fresh = await this.client.getConvention(environment, cityCode);
      check = fresh;
      capabilityCheckedAt = new Date();
      await this.db.query(
        `INSERT INTO municipality_capabilities(city_code, environment, provider, supported, payload, checked_at, expires_at)
         VALUES ($1,$2,'nfse-national',$3,$4::jsonb,NOW(),NOW()+INTERVAL '24 hours')
         ON CONFLICT(city_code, environment, provider)
         DO UPDATE SET supported=EXCLUDED.supported, payload=EXCLUDED.payload, checked_at=NOW(), expires_at=EXCLUDED.expires_at`,
        [cityCode, environment, fresh.supported, JSON.stringify(fresh.payload ?? null)],
      );
    }

    const capabilityCheckedIso = capabilityCheckedAt.toISOString();
    const evidenceDate = capabilityCheckedIso.slice(0, 10);

    if (!check.supported) {
      return {
        cityCode, environment,
        nationalStandard: false,
        nationalAdnParticipant: false,
        nationalPublicIssuer: false,
        route: 'unknown', provider: 'unknown',
        source: 'official-national-parameters',
        sourceUrl: NATIONAL_ADHESION_MONITOR_URL,
        evidenceDate,
        effectiveFrom: null,
        confidence: 'medium',
        checkedAt: capabilityCheckedIso,
        evidence: check.payload,
      };
    }

    // A successful convention lookup proves a national convention/participation signal,
    // but by itself does NOT prove that the municipality enabled the National Public Issuer.
    // Exact structured flags keep ADN participation separate from direct issuer capability.
    const explicitNationalIssuer = officialNationalIssuerEnabled(check.payload);
    const explicitAdnParticipant = officialNationalEnvironmentEnabled(check.payload) || explicitNationalIssuer;

    return {
      cityCode, environment,
      nationalStandard: true,
      nationalAdnParticipant: explicitAdnParticipant,
      nationalPublicIssuer: explicitNationalIssuer,
      route: explicitNationalIssuer ? 'national-direct' : 'unknown',
      provider: explicitNationalIssuer ? 'nfse-national' : 'unknown',
      source: 'official-national-parameters',
      sourceUrl: NATIONAL_ADHESION_MONITOR_URL,
      evidenceDate,
      effectiveFrom: null,
      confidence: explicitNationalIssuer ? 'high' : explicitAdnParticipant ? 'medium' : 'medium',
      checkedAt: capabilityCheckedIso,
      evidence: check.payload,
    };
  }
}
