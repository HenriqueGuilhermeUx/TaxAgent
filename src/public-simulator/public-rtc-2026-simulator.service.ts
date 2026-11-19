import { BadRequestException, Injectable } from '@nestjs/common';
import { calculate2026StandardReference } from '../tax-engine/tax-rules';
import { PublicRtc2026SimulationDto } from './public-rtc-2026-simulation.dto';

@Injectable()
export class PublicRtc2026SimulatorService {
  simulate(dto: PublicRtc2026SimulationDto) {
    const year = Number(dto.effective_date.slice(0, 4));
    if (year !== 2026) {
      throw new BadRequestException('Public RTC reference simulator currently supports effective dates in 2026 only');
    }

    const calculation = calculate2026StandardReference(dto.amount, dto.effective_date, dto.tax_treatment);
    if (!calculation) {
      return {
        status: 'review_required',
        authoritative: false,
        reference_only: true,
        effective_date: dto.effective_date,
        tax_treatment: dto.tax_treatment,
        calculation: null,
        reason: dto.tax_treatment === 'standard'
          ? 'reference_calculation_unavailable'
          : 'non_standard_treatment_requires_verified_official_rules',
        policy: {
          no_pii_collected: true,
          no_persistence: true,
          no_financial_action: true,
          no_invoice_binding: true,
          no_2027_estimate_while_official_freshness_is_unresolved: true,
        },
      };
    }

    return {
      status: 'reference_calculated',
      authoritative: false,
      reference_only: true,
      effective_date: dto.effective_date,
      tax_treatment: dto.tax_treatment,
      calculation,
      policy: {
        no_pii_collected: true,
        no_persistence: true,
        no_financial_action: true,
        no_invoice_binding: true,
        no_2027_estimate_while_official_freshness_is_unresolved: true,
      },
      warning: 'Referência informativa de 2026. A aplicabilidade efetiva depende da classificação e das regras oficiais vigentes para a operação.',
    };
  }
}
