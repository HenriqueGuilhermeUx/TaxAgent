import { Injectable } from '@nestjs/common';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { OfficialRtcService } from './official-rtc.service';
import { CanonicalRegularCalculationDto, CanonicalSimplesCalculationDto } from './canonical-rtc.dto';
import { mapCanonicalRegular, mapCanonicalSimples } from './canonical-rtc.mapper';

type DecisionStatus = 'resolved' | 'requires_input' | 'unsupported';

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

@Injectable()
export class CanonicalRtcService {
  constructor(
    private readonly db: DatabaseService,
    private readonly rtc: OfficialRtcService,
  ) {}

  async calculateRegular(companyId: string, dto: CanonicalRegularCalculationDto) {
    const mapped = mapCanonicalRegular(dto);
    const calculation = await this.rtc.calculate('regular', mapped) as OfficialRtcCalculationResult;
    const freshness = await this.rtc.freshness();
    return this.persist(companyId, dto.effective_at.slice(0, 10), 'regular', dto, mapped, calculation, freshness);
  }

  async calculateSimples(companyId: string, dto: CanonicalSimplesCalculationDto) {
    const mapped = mapCanonicalSimples(dto);
    const calculation = await this.rtc.calculate('simples', mapped) as OfficialRtcCalculationResult;
    return this.persist(companyId, dto.effective_date.slice(0, 10), 'simples', dto, mapped, calculation);
  }

  private async persist(
    companyId: string,
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
    const output = {
      status,
      decision_kind: 'rtc_calculation',
      regime,
      authoritative: calculation.assessment?.authoritative_eligible === true
        && (regime !== 'regular' || (freshness as any)?.regular?.authoritative_eligible === true),
      reference_only: calculation.assessment?.authoritative_eligible !== true
        || (regime === 'regular' && (freshness as any)?.regular?.authoritative_eligible !== true),
      assessment: calculation.assessment,
      freshness,
      engine: calculation.engine,
      calculation: calculation.result,
      policy: {
        ai_authoritative: false,
        http_success_is_fiscal_success: false,
        issuance_binding_allowed: false,
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
        JSON.stringify({ canonical: canonicalInput, mapped_official: mappedInput }),
        JSON.stringify(output),
        JSON.stringify([source]),
      ],
    );

    return {
      decision_id: id,
      decision_kind: 'rtc_calculation',
      status,
      ...output,
      sources: [source],
    };
  }
}
