import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { OfficialRtcService } from './official-rtc.service';
import { CanonicalRegularCalculationDto, CanonicalSimplesActivityQueryDto, CanonicalSimplesCalculationDto } from './canonical-rtc.dto';
import { mapCanonicalRegular, mapCanonicalSimples } from './canonical-rtc.mapper';

type DecisionStatus = 'resolved' | 'requires_input' | 'unsupported';

interface OfficialRtcSimplesActivityResult {
  engine: {
    id: string;
    upstreamRepository: string;
    upstreamCommit: string;
    upstreamRelease: string;
    license: string;
  };
  mode: string;
  checked_at: string;
  result: unknown;
}

interface OfficialRtcCalculationResult {
  engine: {
    id: string;
    upstreamRepository: string;
    upstreamCommit: string;
    upstreamRelease: string;
    license: string;
  };
  mode: string;
  input_sha256: string;
  calculated_at: string;
  assessment?: {
    response_valid?: boolean;
    all_items_usable?: boolean;
    authoritative_eligible?: boolean;
    simulation_only?: boolean;
    counts?: Record<string, number>;
  };
  result: unknown;
}

export function rtcDecisionStatus(result: OfficialRtcCalculationResult): DecisionStatus {
  const assessment = result.assessment;
  if (!assessment?.response_valid) return 'requires_input';
  if ((assessment.counts?.unsupported ?? 0) > 0) return 'unsupported';
  if (!assessment.all_items_usable) return 'requires_input';
  return 'resolved';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function simplesDocumentType(documentKind: 'nfe' | 'nfce' | 'nfse'): string {
  return documentKind === 'nfe' ? '55' : documentKind === 'nfce' ? '65' : '91';
}

export function normalizeCanonicalSimplesActivityCompatibility(
  environment: 'test' | 'production',
  activityCode: string,
  query: CanonicalSimplesActivityQueryDto,
  lookup: OfficialRtcSimplesActivityResult,
) {
  const result = lookup.result;
  if (
    !isRecord(result)
    || result.codigo !== activityCode
    || typeof result.disponivel !== 'boolean'
    || typeof result.admissivelNoDocumento !== 'boolean'
    || typeof result.compativelComClassTrib !== 'boolean'
    || typeof result.sujeitaFatorR !== 'boolean'
    || !Array.isArray(result.tpDocsAdmissiveis)
    || !result.tpDocsAdmissiveis.every((value) => typeof value === 'string')
    || !(result.anexoSemFatorR === null || typeof result.anexoSemFatorR === 'string')
    || !(result.anexoComFatorR === null || typeof result.anexoComFatorR === 'string')
  ) {
    throw new BadGatewayException('Official Simples activity lookup returned an invalid compatibility envelope');
  }

  return {
    activity_code: activityCode,
    effective_date: query.effective_date.slice(0, 10),
    document_kind: query.document_kind,
    tax_classification: query.tax_classification,
    environment,
    compatible: result.disponivel === true
      && result.admissivelNoDocumento === true
      && result.compativelComClassTrib === true,
    official: {
      available: result.disponivel,
      admissible_on_document: result.admissivelNoDocumento,
      compatible_with_tax_classification: result.compativelComClassTrib,
      factor_r_subject: result.sujeitaFatorR,
      annex_without_factor_r: result.anexoSemFatorR,
      annex_with_factor_r: result.anexoComFatorR,
      admissible_documents: result.tpDocsAdmissiveis,
    },
    source: {
      authority: 'receita-federal-open-source-engine',
      engine_id: lookup.engine.id,
      repository: lookup.engine.upstreamRepository,
      release: lookup.engine.upstreamRelease,
      commit: lookup.engine.upstreamCommit,
      mode: lookup.mode,
      checked_at: lookup.checked_at,
    },
    policy: {
      rates_inferred: false,
      calculation_executed: false,
      financial_action_allowed: false,
      issuance_binding_allowed: false,
    },
  };
}

@Injectable()
export class CanonicalRtcService {
  constructor(
    private readonly db: DatabaseService,
    private readonly rtc: OfficialRtcService,
  ) {}

  async calculateRegular(companyId: string, environment: 'test' | 'production', dto: CanonicalRegularCalculationDto) {
    const mapped = mapCanonicalRegular(dto);
    const calculation = await this.rtc.calculate('regular', mapped) as OfficialRtcCalculationResult;
    const freshness = await this.rtc.freshness();
    return this.persist(companyId, environment, dto.effective_at.slice(0, 10), 'regular', dto, mapped, calculation, freshness);
  }

  async simplesActivityCompatibility(
    environment: 'test' | 'production',
    activityCode: string,
    query: CanonicalSimplesActivityQueryDto,
  ) {
    if (!/^\d{2}$/.test(activityCode)) throw new BadRequestException('activityCode must use two digits');
    const lookup = await this.rtc.simplesActivity(
      activityCode,
      query.effective_date.slice(0, 10),
      simplesDocumentType(query.document_kind),
      query.tax_classification,
    ) as OfficialRtcSimplesActivityResult;
    return normalizeCanonicalSimplesActivityCompatibility(environment, activityCode, query, lookup);
  }

  async calculateSimples(companyId: string, environment: 'test' | 'production', dto: CanonicalSimplesCalculationDto) {
    const mapped = mapCanonicalSimples(dto);
    const calculation = await this.rtc.calculate('simples', mapped) as OfficialRtcCalculationResult;
    const freshness = await this.rtc.freshness();
    return this.persist(companyId, environment, dto.effective_date.slice(0, 10), 'simples', dto, mapped, calculation, freshness);
  }

  private async persist(
    companyId: string,
    environment: 'test' | 'production',
    effectiveAt: string,
    regime: 'regular' | 'simples',
    canonicalInput: unknown,
    mappedInput: Record<string, unknown>,
    calculation: OfficialRtcCalculationResult,
    freshness?: unknown,
  ) {
    const status = rtcDecisionStatus(calculation);
    const id = createId('taxdec');
    const source = {
      authority: 'receita-federal-open-source-engine',
      engine_id: calculation.engine.id,
      repository: calculation.engine.upstreamRepository,
      release: calculation.engine.upstreamRelease,
      commit: calculation.engine.upstreamCommit,
      license: calculation.engine.license,
      mode: calculation.mode,
      input_sha256: calculation.input_sha256,
      calculated_at: calculation.calculated_at,
      ...(freshness ? { freshness } : {}),
    };
    const freshnessEligible = regime === 'regular'
      ? (freshness as any)?.regular?.authoritative_eligible === true
      : (freshness as any)?.simples?.authoritative_eligible === true;
    const authoritative = calculation.assessment?.authoritative_eligible === true && freshnessEligible;
    const output = {
      status,
      decision_kind: 'rtc_calculation',
      regime,
      environment,
      authoritative,
      reference_only: !authoritative,
      assessment: calculation.assessment,
      freshness,
      engine: calculation.engine,
      calculation: calculation.result,
      policy: {
        ai_authoritative: false,
        http_success_is_fiscal_success: false,
        issuance_binding_allowed: false,
        authoritative_requires_freshness: true,
        simples_freshness_implemented: true,
        simples_application_reference_verified: regime === 'simples'
          ? (freshness as any)?.simples?.application_reference_verified === true
          : undefined,
      },
    };

    await this.db.query(
      `INSERT INTO tax_decisions(id, company_id, effective_at, status, decision_kind, input, output, sources)
       VALUES ($1,$2,$3,$4,'rtc_calculation',$5::jsonb,$6::jsonb,$7::jsonb)`,
      [
        id,
        companyId,
        effectiveAt,
        status,
        JSON.stringify({ environment, canonical: canonicalInput, mapped_official: mappedInput }),
        JSON.stringify(output),
        JSON.stringify([source]),
      ],
    );

    return {
      decision_id: id,
      ...output,
      sources: [source],
    };
  }
}
