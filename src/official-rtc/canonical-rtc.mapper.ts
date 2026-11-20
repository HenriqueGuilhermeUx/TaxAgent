import { BadRequestException } from '@nestjs/common';
import { CanonicalRegularCalculationDto, CanonicalSimplesCalculationDto } from './canonical-rtc.dto';

const REGULAR_ROC_VERSION = '0.0.1';
const SIMPLES_ENDPOINT_VERSION = '2.0.0';

function yearFromIso(value: string): number {
  const match = String(value).match(/^(\d{4})-/);
  if (!match) throw new BadRequestException('Effective date must begin with a four-digit year');
  return Number(match[1]);
}

function decimal(value: number): string {
  if (!Number.isFinite(value)) throw new BadRequestException('Fiscal numeric values must be finite');
  return String(value);
}

export function mapCanonicalRegular(dto: CanonicalRegularCalculationDto): Record<string, unknown> {
  const year = yearFromIso(dto.effective_at);
  const items = dto.items.map((item) => {
    if (year >= 2027 && !item.nominal_rates) {
      throw new BadRequestException(`items[${item.number}].nominal_rates is required from 2027 onward by the pinned official regular engine`);
    }
    if (year < 2027 && item.nominal_rates) {
      throw new BadRequestException(`items[${item.number}].nominal_rates is forbidden before 2027 by the pinned official regular engine`);
    }
    return {
      numero: item.number,
      nbs: item.nbs,
      cst: item.cst,
      cClassTrib: item.tax_classification,
      baseCalculo: item.tax_base,
      ...(item.quantity !== undefined ? { quantidade: item.quantity } : {}),
      ...(item.unit ? { unidade: item.unit } : {}),
      ...(item.nominal_rates ? {
        aliquotasNominais: {
          cbs: item.nominal_rates.cbs,
          ibsEstadual: item.nominal_rates.ibs_state,
          ibsMunicipal: item.nominal_rates.ibs_municipal,
        },
      } : {}),
    };
  });

  return {
    id: dto.operation_id,
    versao: REGULAR_ROC_VERSION,
    dhFatoGerador: dto.effective_at,
    municipio: Number(dto.municipality_code),
    uf: dto.uf,
    tpDoc: 91,
    itens: items,
  };
}

export function mapCanonicalSimples(dto: CanonicalSimplesCalculationDto): Record<string, unknown> {
  const tpDoc = dto.document_kind === 'nfe' ? '55' : dto.document_kind === 'nfce' ? '65' : '91';
  return {
    id: dto.operation_id,
    versao: SIMPLES_ENDPOINT_VERSION,
    data: dto.effective_date.slice(0, 10),
    tpDoc,
    CRT: dto.crt,
    ...(dto.ibs_cbs_regime_type ? { tpRegimeIBSCBS: dto.ibs_cbs_regime_type } : {}),
    ...(dto.government_entity_type ? { tpEnteGov: dto.government_entity_type } : {}),
    itens: dto.items.map((item) => ({
      numero: item.number,
      cAtivSN: item.activity_code,
      cClassTrib: item.tax_classification,
      baseCalculo: item.tax_base.toFixed(2),
      valorImpostoSeletivo: item.selective_tax_amount.toFixed(2),
      ...(item.ibs_effective_rate !== undefined ? { pIBSSN: decimal(item.ibs_effective_rate) } : {}),
      ...(item.cbs_effective_rate !== undefined ? { pCBSSN: decimal(item.cbs_effective_rate) } : {}),
    })),
  };
}
