import { Injectable } from '@nestjs/common';
import { FiscalEngineError } from '../fiscal-core/fiscal-engine.error';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { IbgeLocationsClient, IbgeMunicipality } from './ibge-locations.client';
import { MunicipalCapabilityService } from './municipal-capability.service';
import { METROPOLITAN_REGIONS, metropolitanRegion } from './metropolitan-regions.registry';

export type MetropolitanCoverageClass = 'national-direct' | 'municipal-provider' | 'participation-only' | 'unknown';

function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function coverageObservation(classification: MetropolitanCoverageClass): string {
  switch (classification) {
    case 'national-direct':
      return 'Direct national issuance is backed by explicit public-issuer or taxpayer-regime evidence.';
    case 'municipal-provider':
      return 'TaxAgent has a municipality/provider route, but direct National Public Issuer capability is not claimed.';
    case 'participation-only':
      return 'National convention/ADN participation is visible, but that alone does not authorize direct SEFIN issuance.';
    default:
      return 'Insufficient current evidence for an issuance route; keep fail-closed.';
  }
}

@Injectable()
export class MetropolitanCoverageService {
  constructor(
    private readonly ibge: IbgeLocationsClient,
    private readonly capabilities: MunicipalCapabilityService,
  ) {}

  listRegions() {
    return METROPOLITAN_REGIONS.map((region) => ({
      slug: region.slug,
      name: region.name,
      state: region.state,
      municipality_count: region.municipalities.length,
      source_url: region.sourceUrl,
    }));
  }

  async inspectAll(environment: FiscalEnvironment, taxRegime?: string, effectiveAt?: string) {
    const regions = await Promise.all(METROPOLITAN_REGIONS.map((region) => this.inspect(region.slug, environment, taxRegime, effectiveAt)));
    const totals = regions.reduce((acc, result) => {
      for (const key of ['national-direct', 'municipal-provider', 'participation-only', 'unknown'] as MetropolitanCoverageClass[]) {
        acc[key] += result.counts[key];
      }
      return acc;
    }, { 'national-direct': 0, 'municipal-provider': 0, 'participation-only': 0, unknown: 0 } as Record<MetropolitanCoverageClass, number>);
    const result = {
      environment,
      tax_regime: taxRegime ?? null,
      effective_at: (effectiveAt ?? new Date().toISOString()).slice(0, 10),
      region_count: regions.length,
      municipality_count: regions.reduce((sum, region) => sum + region.municipalities.length, 0),
      totals,
      regions,
      checked_at: new Date().toISOString(),
    };
    console.log(JSON.stringify({
      event: 'metropolitan_coverage_aggregate_result',
      environment,
      tax_regime: taxRegime ?? null,
      effective_at: result.effective_at,
      region_count: result.region_count,
      municipality_count: result.municipality_count,
      totals,
    }));
    return result;
  }

  async inspect(slug: string, environment: FiscalEnvironment, taxRegime?: string, effectiveAt?: string) {
    const region = metropolitanRegion(slug);
    if (!region) throw new FiscalEngineError('TA_METRO_REGION_UNKNOWN', `Unknown metropolitan region: ${slug}`, false);
    if (!['test', 'production'].includes(environment)) throw new FiscalEngineError('TA_ENVIRONMENT_INVALID', 'environment must be test or production', false);

    const ibgeMunicipalities = await this.ibge.municipalitiesByState(region.state);
    const byName = new Map(ibgeMunicipalities.map((municipality) => [normalizeName(municipality.name), municipality]));
    const resolved = region.municipalities.map((name) => ({ name, ibge: byName.get(normalizeName(name)) }));
    const missing = resolved.filter((row) => !row.ibge).map((row) => row.name);
    if (missing.length > 0) {
      throw new FiscalEngineError('TA_METRO_IBGE_RESOLUTION_FAILED', `IBGE codes could not be resolved for ${missing.join(', ')}`, true, { region: slug, missing });
    }

    const rows = await this.mapConcurrent(resolved as Array<{ name: string; ibge: IbgeMunicipality }>, 6, async ({ name, ibge }) => {
      try {
        const capability = await this.capabilities.resolve(ibge.cityCode, environment, { taxRegime, effectiveAt });
        const classification: MetropolitanCoverageClass = capability.route === 'national-direct' && capability.nationalPublicIssuer
          ? 'national-direct'
          : capability.route === 'municipal-provider'
            ? 'municipal-provider'
            : capability.nationalStandard || capability.nationalAdnParticipant
              ? 'participation-only'
              : 'unknown';
        return {
          municipality: name,
          state: region.state,
          city_code: ibge.cityCode,
          metropolitan_region: region.name,
          classification,
          route: capability.route,
          provider: capability.provider,
          national_convention_present: capability.nationalStandard,
          adn_participation: capability.nationalAdnParticipant,
          national_public_issuer: capability.nationalPublicIssuer,
          source: capability.source,
          source_url: capability.sourceUrl,
          evidence_date: capability.evidenceDate,
          effective_from: capability.effectiveFrom,
          confidence: capability.confidence,
          observation: coverageObservation(classification),
          checked_at: capability.checkedAt,
        };
      } catch (error) {
        const code = error instanceof FiscalEngineError ? error.code : 'TA_METRO_CAPABILITY_LOOKUP_FAILED';
        const now = new Date().toISOString();
        return {
          municipality: name,
          state: region.state,
          city_code: ibge.cityCode,
          metropolitan_region: region.name,
          classification: 'unknown' as const,
          route: 'unknown' as const,
          provider: 'unknown' as const,
          national_convention_present: false,
          adn_participation: false,
          national_public_issuer: false,
          source: 'lookup-error',
          source_url: null,
          evidence_date: now.slice(0, 10),
          effective_from: null,
          confidence: 'low' as const,
          observation: coverageObservation('unknown'),
          checked_at: now,
          error_code: code,
        };
      }
    });

    const counts = rows.reduce((acc, row) => {
      acc[row.classification] += 1;
      return acc;
    }, { 'national-direct': 0, 'municipal-provider': 0, 'participation-only': 0, unknown: 0 } as Record<MetropolitanCoverageClass, number>);

    const result = {
      region: { slug: region.slug, name: region.name, state: region.state, source_url: region.sourceUrl },
      environment,
      tax_regime: taxRegime ?? null,
      effective_at: (effectiveAt ?? new Date().toISOString()).slice(0, 10),
      methodology: {
        direct_rule: 'national-direct only when an explicit official national public issuer capability or applicable taxpayer-regime rule proves eligibility',
        participation_rule: 'national convention or ADN participation alone never unlocks direct SEFIN issuance',
        adn_rule: 'ADN participation is read only from the exact structured aderenteAmbienteNacional flag, or implied by an explicit National Public Issuer flag',
        evidence_rule: 'commercial coverage remains fail-closed when evidence is missing, stale, ambiguous or lookup fails',
        city_codes: 'IBGE Localidades API',
      },
      counts,
      municipalities: rows,
      checked_at: new Date().toISOString(),
    };

    console.log(JSON.stringify({
      event: 'metropolitan_coverage_result',
      region: region.slug,
      environment,
      tax_regime: taxRegime ?? null,
      effective_at: result.effective_at,
      counts,
      municipality_count: rows.length,
      municipalities: rows.map((row) => ({
        municipality: row.municipality,
        city_code: row.city_code,
        classification: row.classification,
        route: row.route,
        provider: row.provider,
        adn_participation: row.adn_participation,
        national_public_issuer: row.national_public_issuer,
        confidence: row.confidence,
        source: row.source,
        error_code: 'error_code' in row ? row.error_code : undefined,
      })),
    }));
    return result;
  }

  private async mapConcurrent<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
    const out = new Array<R>(items.length);
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        out[index] = await worker(items[index]);
      }
    });
    await Promise.all(runners);
    return out;
  }
}
