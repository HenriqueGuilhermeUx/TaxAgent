import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { CanonicalRegularCalculationDto, CanonicalSimplesCalculationDto } from './canonical-rtc.dto';
import { CanonicalRtcService } from './canonical-rtc.service';
import { ParsedBatchRow, RtcBatchUploadedFile, parseRtcBatchFile } from './rtc-batch-file.parser';

type Environment = 'test' | 'production';
type Regime = 'regular' | 'simples';

function text(row: Record<string, string>, key: string, required = true): string | undefined {
  const value = String(row[key] ?? '').trim();
  if (!value && required) throw new BadRequestException(`Missing required column value: ${key}`);
  return value || undefined;
}

function numberValue(row: Record<string, string>, key: string, required = true): number | undefined {
  const raw = text(row, key, required);
  if (raw === undefined) return undefined;
  if (!/^-?\d+(?:[.,]\d+)?$/.test(raw)) throw new BadRequestException(`Invalid numeric value: ${key}`);
  const value = Number(raw.replace(',', '.'));
  if (!Number.isFinite(value)) throw new BadRequestException(`Invalid numeric value: ${key}`);
  return value;
}

function validationFields(errors: ValidationError[]): Array<{ field: string; rules: string[] }> {
  const output: Array<{ field: string; rules: string[] }> = [];
  const walk = (items: ValidationError[], prefix = '') => {
    for (const item of items) {
      const field = prefix ? `${prefix}.${item.property}` : item.property;
      if (item.constraints) output.push({ field, rules: Object.keys(item.constraints).sort() });
      if (item.children?.length) walk(item.children, field);
    }
  };
  walk(errors);
  return output;
}

function validateDto<T extends object>(type: new () => T, value: object): T {
  const instance = plainToInstance(type, value);
  const errors = validateSync(instance, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length) {
    const error = new BadRequestException('Batch row validation failed') as BadRequestException & { batchFields?: Array<{ field: string; rules: string[] }> };
    error.batchFields = validationFields(errors);
    throw error;
  }
  return instance;
}

export function regularDtoFromBatchRow(row: ParsedBatchRow): CanonicalRegularCalculationDto {
  const values = row.values;
  const cbs = numberValue(values, 'cbs', false);
  const ibsState = numberValue(values, 'ibs_state', false);
  const ibsMunicipal = numberValue(values, 'ibs_municipal', false);
  const hasAnyRate = cbs !== undefined || ibsState !== undefined || ibsMunicipal !== undefined;
  if (hasAnyRate && (cbs === undefined || ibsState === undefined || ibsMunicipal === undefined)) {
    throw new BadRequestException('cbs, ibs_state and ibs_municipal must be supplied together');
  }

  return validateDto(CanonicalRegularCalculationDto, {
    operation_id: text(values, 'operation_id'),
    effective_at: text(values, 'effective_at'),
    municipality_code: text(values, 'municipality_code'),
    uf: text(values, 'uf')?.toUpperCase(),
    document_kind: 'nfse',
    items: [{
      number: numberValue(values, 'item_number', false) ?? 1,
      nbs: text(values, 'nbs'),
      cst: text(values, 'cst'),
      tax_classification: text(values, 'tax_classification'),
      tax_base: numberValue(values, 'tax_base'),
      ...(numberValue(values, 'quantity', false) !== undefined ? { quantity: numberValue(values, 'quantity', false) } : {}),
      ...(text(values, 'unit', false) ? { unit: text(values, 'unit', false) } : {}),
      ...(hasAnyRate ? { nominal_rates: { cbs, ibs_state: ibsState, ibs_municipal: ibsMunicipal } } : {}),
    }],
  });
}

export function simplesDtoFromBatchRow(row: ParsedBatchRow): CanonicalSimplesCalculationDto {
  const values = row.values;
  return validateDto(CanonicalSimplesCalculationDto, {
    operation_id: text(values, 'operation_id'),
    effective_date: text(values, 'effective_date'),
    document_kind: text(values, 'document_kind')?.toLowerCase(),
    crt: text(values, 'crt'),
    ...(text(values, 'ibs_cbs_regime_type', false) ? { ibs_cbs_regime_type: text(values, 'ibs_cbs_regime_type', false) } : {}),
    ...(text(values, 'government_entity_type', false) ? { government_entity_type: text(values, 'government_entity_type', false) } : {}),
    items: [{
      number: numberValue(values, 'item_number', false) ?? 1,
      activity_code: text(values, 'activity_code'),
      tax_classification: text(values, 'tax_classification'),
      tax_base: numberValue(values, 'tax_base'),
      selective_tax_amount: numberValue(values, 'selective_tax_amount'),
      ...(numberValue(values, 'ibs_effective_rate', false) !== undefined ? { ibs_effective_rate: numberValue(values, 'ibs_effective_rate', false) } : {}),
      ...(numberValue(values, 'cbs_effective_rate', false) !== undefined ? { cbs_effective_rate: numberValue(values, 'cbs_effective_rate', false) } : {}),
    }],
  });
}

function errorCode(error: unknown): string {
  if (error instanceof BadRequestException) return 'validation_error';
  if (error instanceof ServiceUnavailableException) return 'engine_unavailable';
  return 'calculation_failed';
}

function batchFields(error: unknown): Array<{ field: string; rules: string[] }> | undefined {
  const value = error as { batchFields?: Array<{ field: string; rules: string[] }> };
  return value?.batchFields;
}

@Injectable()
export class RtcBatchService {
  constructor(private readonly rtc: CanonicalRtcService) {}

  async regular(companyId: string, environment: Environment, file: RtcBatchUploadedFile | undefined) {
    return this.process('regular', companyId, environment, file);
  }

  async simples(companyId: string, environment: Environment, file: RtcBatchUploadedFile | undefined) {
    return this.process('simples', companyId, environment, file);
  }

  private async process(regime: Regime, companyId: string, environment: Environment, file: RtcBatchUploadedFile | undefined) {
    const parsed = parseRtcBatchFile(file);
    const results: any[] = [];

    for (const row of parsed.rows) {
      let operationId = row.values.operation_id || undefined;
      try {
        if (regime === 'regular') {
          const dto = regularDtoFromBatchRow(row);
          operationId = dto.operation_id;
          const decision: any = await this.rtc.calculateRegular(companyId, environment, dto);
          results.push(this.successRow(row.row_number, operationId, decision));
        } else {
          const dto = simplesDtoFromBatchRow(row);
          operationId = dto.operation_id;
          const decision: any = await this.rtc.calculateSimples(companyId, environment, dto);
          results.push(this.successRow(row.row_number, operationId, decision));
        }
      } catch (error) {
        results.push({
          row_number: row.row_number,
          operation_id: operationId,
          outcome: 'failed',
          error_code: errorCode(error),
          ...(batchFields(error) ? { validation_fields: batchFields(error) } : {}),
        });
      }
    }

    const counts = {
      resolved: results.filter((row) => row.status === 'resolved').length,
      requires_input: results.filter((row) => row.status === 'requires_input').length,
      unsupported: results.filter((row) => row.status === 'unsupported').length,
      failed: results.filter((row) => row.outcome === 'failed').length,
    };

    return {
      regime,
      format: parsed.format,
      row_count: parsed.rows.length,
      processed_sequentially: true,
      counts,
      rows: results,
      policy: {
        max_rows: 100,
        no_parallel_sidecar_burst: true,
        each_success_persists_rtc_tax_decision: true,
        financial_action_allowed: false,
        issuance_binding_allowed: false,
      },
    };
  }

  private successRow(rowNumber: number, operationId: string, decision: any) {
    return {
      row_number: rowNumber,
      operation_id: operationId,
      outcome: 'decision',
      decision_id: decision.decision_id,
      status: decision.status,
      authoritative: decision.authoritative === true,
      reference_only: decision.reference_only !== false,
      assessment: decision.assessment ? {
        all_items_usable: decision.assessment.all_items_usable === true,
        simulation_only: decision.assessment.simulation_only === true,
        counts: decision.assessment.counts ?? {},
      } : undefined,
      engine: decision.engine ? {
        id: decision.engine.id,
        release: decision.engine.upstreamRelease,
        commit: decision.engine.upstreamCommit,
      } : undefined,
    };
  }
}
