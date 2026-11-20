import { HttpException, Injectable } from '@nestjs/common';
import { CanonicalRtcService } from './canonical-rtc.service';
import { CanonicalRegularCalculationDto, CanonicalSimplesCalculationDto } from './canonical-rtc.dto';
import { mapCanonicalRegular, mapCanonicalSimples } from './canonical-rtc.mapper';
import { OfficialRtcService } from './official-rtc.service';
import { RegularSimulatorBatchDto, SimplesSimulatorBatchDto } from './simulator-batch.dto';

export interface SimulatorRowResult {
  operation_id: string;
  status: 'valid' | 'calculated' | 'requires_input' | 'unsupported' | 'engine_unavailable' | 'failed';
  decision_id?: string;
  authoritative?: boolean;
  reference_only: true | boolean;
  error_code?: string;
}

function boundedErrorCode(error: unknown): string {
  if (error instanceof HttpException) {
    const status = error.getStatus();
    if (status === 400) return 'invalid_input';
    if (status === 503) return 'engine_unavailable';
    if (status === 401 || status === 403) return 'access_denied';
    return `http_${status}`;
  }
  return 'internal_failure';
}

function decisionRow(operationId: string, decision: any): SimulatorRowResult {
  const status = decision?.status;
  return {
    operation_id: operationId,
    status: status === 'resolved'
      ? 'calculated'
      : status === 'requires_input'
        ? 'requires_input'
        : status === 'unsupported'
          ? 'unsupported'
          : 'failed',
    decision_id: typeof decision?.decision_id === 'string' ? decision.decision_id : undefined,
    authoritative: decision?.authoritative === true,
    reference_only: decision?.reference_only !== false,
  };
}

@Injectable()
export class SimulatorBatchService {
  constructor(
    private readonly official: OfficialRtcService,
    private readonly canonical: CanonicalRtcService,
  ) {}

  async readiness() {
    const status = this.official.status();
    const freshness = await this.official.freshness();
    const mode = status.mode;
    const regularConfigured = status.engines.regular.configured;
    const simplesConfigured = status.engines.simples.configured;

    return {
      mode,
      engines: {
        regular: {
          configured: regularConfigured,
          calculation_available: mode !== 'off' && regularConfigured,
          authoritative_available: mode === 'official' && regularConfigured && freshness.regular.authoritative_eligible === true,
          reference_only: !(mode === 'official' && regularConfigured && freshness.regular.authoritative_eligible === true),
        },
        simples: {
          configured: simplesConfigured,
          calculation_available: mode !== 'off' && simplesConfigured,
          authoritative_available: mode === 'official' && simplesConfigured && freshness.simples.authoritative_eligible === true,
          reference_only: !(mode === 'official' && simplesConfigured && freshness.simples.authoritative_eligible === true),
        },
      },
      freshness,
      policy: {
        validate_only_available: true,
        official_simples_activity_validation_available: mode !== 'off' && simplesConfigured,
        batch_max_rows: 100,
        financial_action_allowed: false,
        issuance_binding_allowed: false,
        ai_authoritative: false,
      },
    };
  }

  validateRegular(dto: CanonicalRegularCalculationDto) {
    mapCanonicalRegular(dto);
    return {
      operation_id: dto.operation_id,
      status: 'valid' as const,
      regime: 'regular' as const,
      document_kind: dto.document_kind,
      validation_level: 'structural_only' as const,
      calculation_performed: false,
      reference_only: true,
      policy: {
        fiscal_fields_not_inferred: true,
        financial_action_allowed: false,
        issuance_binding_allowed: false,
      },
    };
  }

  validateSimples(dto: CanonicalSimplesCalculationDto) {
    mapCanonicalSimples(dto);
    return {
      operation_id: dto.operation_id,
      status: 'valid' as const,
      regime: 'simples' as const,
      document_kind: dto.document_kind,
      validation_level: 'structural_only' as const,
      calculation_performed: false,
      reference_only: true,
      policy: {
        fiscal_fields_not_inferred: true,
        official_activity_compatibility_checked: false,
        financial_action_allowed: false,
        issuance_binding_allowed: false,
      },
    };
  }

  async validateSimplesOfficial(environment: 'test' | 'production', dto: CanonicalSimplesCalculationDto) {
    this.validateSimples(dto);
    const lookups = new Map<string, Promise<any>>();
    const items = [];

    for (const item of dto.items) {
      const key = `${item.activity_code}:${item.tax_classification}`;
      let pending = lookups.get(key);
      if (!pending) {
        pending = this.canonical.simplesActivityCompatibility(
          environment,
          item.activity_code,
          {
            effective_date: dto.effective_date,
            document_kind: dto.document_kind,
            tax_classification: item.tax_classification,
          },
        );
        lookups.set(key, pending);
      }
      const compatibility = await pending;
      items.push({
        number: item.number,
        activity_code: item.activity_code,
        tax_classification: item.tax_classification,
        compatible: compatibility.compatible === true,
        official: compatibility.official,
        source: compatibility.source,
      });
    }

    const compatible = items.every((item) => item.compatible === true);
    return {
      operation_id: dto.operation_id,
      status: compatible ? 'valid' as const : 'requires_input' as const,
      regime: 'simples' as const,
      environment,
      document_kind: dto.document_kind,
      validation_level: 'official_activity_compatibility' as const,
      calculation_performed: false as const,
      reference_only: true as const,
      items,
      policy: {
        structural_validation: true,
        official_activity_compatibility_checked: true,
        fiscal_fields_not_inferred: true,
        rates_inferred: false,
        financial_action_allowed: false,
        issuance_binding_allowed: false,
      },
    };
  }

  async regularBatch(companyId: string, environment: 'test' | 'production', dto: RegularSimulatorBatchDto) {
    const results: SimulatorRowResult[] = [];
    for (const row of dto.rows) {
      try {
        this.validateRegular(row);
        if (dto.execution === 'validate') {
          results.push({ operation_id: row.operation_id, status: 'valid', reference_only: true });
          continue;
        }
        const decision = await this.canonical.calculateRegular(companyId, environment, row);
        results.push(decisionRow(row.operation_id, decision));
      } catch (error) {
        const code = boundedErrorCode(error);
        results.push({
          operation_id: row.operation_id,
          status: code === 'invalid_input' ? 'requires_input' : code === 'engine_unavailable' ? 'engine_unavailable' : 'failed',
          reference_only: true,
          error_code: code,
        });
      }
    }
    return this.batchEnvelope('regular', dto.execution, results);
  }

  async simplesBatch(companyId: string, environment: 'test' | 'production', dto: SimplesSimulatorBatchDto) {
    const results: SimulatorRowResult[] = [];
    for (const row of dto.rows) {
      try {
        this.validateSimples(row);
        if (dto.execution === 'validate') {
          results.push({ operation_id: row.operation_id, status: 'valid', reference_only: true });
          continue;
        }
        const decision = await this.canonical.calculateSimples(companyId, environment, row);
        results.push(decisionRow(row.operation_id, decision));
      } catch (error) {
        const code = boundedErrorCode(error);
        results.push({
          operation_id: row.operation_id,
          status: code === 'invalid_input' ? 'requires_input' : code === 'engine_unavailable' ? 'engine_unavailable' : 'failed',
          reference_only: true,
          error_code: code,
        });
      }
    }
    return this.batchEnvelope('simples', dto.execution, results);
  }

  private batchEnvelope(regime: 'regular' | 'simples', execution: 'validate' | 'calculate', results: SimulatorRowResult[]) {
    const counts = results.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {});
    return {
      regime,
      execution,
      rows: results,
      counts,
      total: results.length,
      policy: {
        partial_results: true,
        zero_tax_on_error: false,
        financial_action_allowed: false,
        issuance_binding_allowed: false,
      },
    };
  }
}
