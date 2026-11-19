import { BadRequestException, Injectable } from '@nestjs/common';
import { TaxPositionService } from './tax-position.service';

type DecisionStatus = 'resolved' | 'requires_input' | 'unsupported';

interface DecisionLike {
  id: string;
  effective_at: string | Date;
  status: string;
  decision_kind: 'issuance' | 'rtc_calculation';
  output: any;
}

export type AgentSummaryUse = 'authoritative_calculation_only' | 'reference_only' | 'review_required';

function boundedCounts(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const allowed = ['calculated', 'simulated', 'input_error', 'unsupported', 'not_calculated', 'technical_failure', 'unknown'];
  const result: Record<string, number> = {};
  for (const key of allowed) {
    const value = Number((raw as Record<string, unknown>)[key]);
    if (Number.isFinite(value) && value >= 0) result[key] = Math.floor(value);
  }
  return result;
}

function freshnessSummary(raw: unknown): { status: string; authoritative_eligible: boolean; reference_app?: string; reference_database?: string } | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const regular = (raw as any).regular;
  if (!regular || typeof regular !== 'object') return undefined;
  const status = typeof regular.status === 'string' ? regular.status : 'unknown';
  const reference = regular.reference && typeof regular.reference === 'object' ? regular.reference : {};
  return {
    status,
    authoritative_eligible: regular.authoritative_eligible === true,
    ...(typeof reference.app === 'string' ? { reference_app: reference.app } : {}),
    ...(typeof reference.database === 'string' ? { reference_database: reference.database } : {}),
  };
}

function nextAction(status: DecisionStatus, authoritative: boolean): string {
  if (status === 'requires_input') return 'collect_or_correct_fiscal_inputs';
  if (status === 'unsupported') return 'route_to_manual_fiscal_review';
  if (authoritative) return 'explain_calculation_only_no_execution';
  return 'explain_reference_only_no_execution';
}

function deterministicPtBr(status: DecisionStatus, authoritative: boolean, regime: string): string {
  if (status === 'requires_input') return 'O cálculo fiscal precisa de dados ou correções antes de ser considerado resolvido. Não execute pagamento ou emissão com este resultado.';
  if (status === 'unsupported') return 'Este cenário não é suportado automaticamente pelo motor atual. Encaminhe para revisão fiscal manual.';
  if (authoritative) return `O cálculo de ${regime} foi resolvido pelo motor fiscal e pode ser explicado como cálculo tributário. Ele não autoriza pagamento, transferência ou emissão de nota.`;
  return `O cálculo de ${regime} foi resolvido apenas como referência. Use para orientação e revisão, nunca para autorizar pagamento, transferência ou emissão de nota.`;
}

export function buildAgentSafeFiscalSummary(decision: DecisionLike) {
  if (decision.decision_kind !== 'rtc_calculation') {
    throw new BadRequestException('Agent-safe fiscal summary is available only for RTC calculation decisions');
  }

  const output = decision.output ?? {};
  const status: DecisionStatus = ['resolved', 'requires_input', 'unsupported'].includes(String(decision.status))
    ? decision.status as DecisionStatus
    : 'requires_input';
  const authoritative = output.authoritative === true && output.reference_only === false;
  const use: AgentSummaryUse = status !== 'resolved'
    ? 'review_required'
    : authoritative
      ? 'authoritative_calculation_only'
      : 'reference_only';

  const assessment = output.assessment && typeof output.assessment === 'object'
    ? {
        all_items_usable: output.assessment.all_items_usable === true,
        authoritative_eligible: output.assessment.authoritative_eligible === true,
        simulation_only: output.assessment.simulation_only === true,
        counts: boundedCounts(output.assessment.counts),
      }
    : undefined;

  const engine = output.engine && typeof output.engine === 'object'
    ? {
        id: typeof output.engine.id === 'string' ? output.engine.id : undefined,
        release: typeof output.engine.upstreamRelease === 'string' ? output.engine.upstreamRelease : undefined,
        commit: typeof output.engine.upstreamCommit === 'string' ? output.engine.upstreamCommit : undefined,
      }
    : undefined;

  const regime = output.regime === 'simples' ? 'Simples Nacional' : output.regime === 'regular' ? 'regime regular' : 'regime fiscal';

  return {
    decision_id: decision.id,
    decision_kind: 'rtc_calculation' as const,
    effective_at: decision.effective_at instanceof Date ? decision.effective_at.toISOString().slice(0, 10) : String(decision.effective_at).slice(0, 10),
    status,
    regime: output.regime === 'simples' ? 'simples' : 'regular',
    environment: output.environment === 'production' ? 'production' : 'test',
    use,
    authoritative,
    reference_only: !authoritative,
    assessment,
    freshness: freshnessSummary(output.freshness),
    engine,
    next_action: nextAction(status, authoritative),
    message: {
      locale: 'pt-BR',
      text: deterministicPtBr(status, authoritative, regime),
    },
    policy: {
      ai_authoritative: false,
      financial_action_allowed: false,
      issuance_binding_allowed: false,
      raw_fiscal_payload_exposed: false,
      raw_document_content_exposed: false,
      taxpayer_pii_exposed: false,
    },
  };
}

@Injectable()
export class TaxDecisionAgentSummaryService {
  constructor(private readonly position: TaxPositionService) {}

  async summarize(decisionId: string, companyId?: string) {
    const decision = await this.position.getDecision(decisionId, companyId);
    return buildAgentSafeFiscalSummary(decision);
  }
}
