export type OfficialRtcObservedState =
  | 'CALCULADO'
  | 'CALCULO_SIMULADO'
  | 'INCONSISTENCIA_ENTRADA'
  | 'NAO_IMPLEMENTADO'
  | 'NAO_CALCULADO'
  | 'FALHA_TECNICA'
  | 'UNKNOWN';

export type OfficialRtcNormalizedOutcome =
  | 'calculated'
  | 'simulated'
  | 'input_error'
  | 'unsupported'
  | 'not_calculated'
  | 'technical_failure'
  | 'unknown';

export interface OfficialRtcItemAssessment {
  index: number;
  nObj?: number;
  state: OfficialRtcObservedState;
  outcome: OfficialRtcNormalizedOutcome;
  usable: boolean;
  authoritativeEligible: boolean;
  errors: unknown[];
}

export interface OfficialRtcAssessment {
  response_valid: boolean;
  all_items_usable: boolean;
  authoritative_eligible: boolean;
  simulation_only: boolean;
  item_count: number;
  counts: Record<OfficialRtcNormalizedOutcome, number>;
  items: OfficialRtcItemAssessment[];
}

const OUTCOMES: Record<string, OfficialRtcNormalizedOutcome> = {
  CALCULADO: 'calculated',
  CALCULO_SIMULADO: 'simulated',
  INCONSISTENCIA_ENTRADA: 'input_error',
  NAO_IMPLEMENTADO: 'unsupported',
  NAO_CALCULADO: 'not_calculated',
  FALHA_TECNICA: 'technical_failure',
};

function emptyCounts(): Record<OfficialRtcNormalizedOutcome, number> {
  return {
    calculated: 0,
    simulated: 0,
    input_error: 0,
    unsupported: 0,
    not_calculated: 0,
    technical_failure: 0,
    unknown: 0,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function assessOfficialRtcObservability(payload: unknown): OfficialRtcAssessment {
  const root = asRecord(payload);
  const objetos = root?.objetos;
  if (!Array.isArray(objetos) || objetos.length === 0) {
    return {
      response_valid: false,
      all_items_usable: false,
      authoritative_eligible: false,
      simulation_only: false,
      item_count: 0,
      counts: emptyCounts(),
      items: [],
    };
  }

  const counts = emptyCounts();
  const items = objetos.map((raw, index): OfficialRtcItemAssessment => {
    const item = asRecord(raw);
    const rawState = typeof item?.estadoItem === 'string' ? item.estadoItem : 'UNKNOWN';
    const outcome = OUTCOMES[rawState] ?? 'unknown';
    const state = (OUTCOMES[rawState] ? rawState : 'UNKNOWN') as OfficialRtcObservedState;
    const usable = outcome === 'calculated' || outcome === 'simulated';
    const authoritativeEligible = outcome === 'calculated';
    const errors = Array.isArray(item?.erros) ? item.erros : [];
    counts[outcome] += 1;
    return {
      index,
      nObj: typeof item?.nObj === 'number' ? item.nObj : undefined,
      state,
      outcome,
      usable,
      authoritativeEligible,
      errors,
    };
  });

  const allItemsUsable = items.every((item) => item.usable);
  const authoritativeEligible = items.every((item) => item.authoritativeEligible);
  const simulationOnly = allItemsUsable && !authoritativeEligible && counts.simulated > 0;

  return {
    response_valid: true,
    all_items_usable: allItemsUsable,
    authoritative_eligible: authoritativeEligible,
    simulation_only: simulationOnly,
    item_count: items.length,
    counts,
    items,
  };
}
