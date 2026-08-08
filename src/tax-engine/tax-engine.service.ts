import { BadRequestException, Injectable } from '@nestjs/common';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { CanonicalInvoiceInput } from '../fiscal-core/fiscal.types';
import { ResolveTaxDto } from './dto/resolve-tax.dto';
import { RtcOpenDataClient } from './rtc-open-data.client';
import { TaxDomainRegistryService } from './tax-domain-registry.service';
import { calculate2026StandardReference } from './tax-rules';

@Injectable()
export class TaxEngineService {
  constructor(
    private readonly db: DatabaseService,
    private readonly rtc: RtcOpenDataClient,
    private readonly domains: TaxDomainRegistryService,
  ) {}

  validate(input: CanonicalInvoiceInput): CanonicalInvoiceInput {
    if (!input.companyId) throw new BadRequestException('companyId is required');
    if (!input.customer.taxId || !input.customer.name) throw new BadRequestException('Customer identity is required');
    if (!/^\d{7}$/.test(input.customer.cityCode)) throw new BadRequestException('customer.cityCode must be a 7-digit IBGE code');
    if (!input.service.description.trim()) throw new BadRequestException('Service description is required');
    if (!Number.isFinite(input.service.amount) || input.service.amount <= 0) throw new BadRequestException('Service amount must be positive');
    return input;
  }

  async resolve(dto: ResolveTaxDto) {
    const missing: string[] = [];
    const warnings: string[] = [];
    const sources: Array<Record<string, unknown>> = [];
    let officialClassification: unknown;
    let candidates: unknown;

    if (!dto.tax_classification) {
      missing.push('tax_classification');
      if (dto.nbs) {
        try {
          const result = await this.rtc.getClassificationsByNbs(dto.nbs);
          const cached = await this.domains.cacheRecord('rtc-classifications-by-nbs', dto.nbs, result, 24);
          candidates = result.payload;
          sources.push({ ...cached, authority: 'runtime-reference' });
        } catch (error) {
          warnings.push(`Could not fetch official NBS classification candidates: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } else {
      try {
        const result = await this.rtc.getClassificationForNfse(dto.tax_classification);
        const cached = await this.domains.cacheRecord('rtc-nfse-cclasstrib', dto.tax_classification, result, 24);
        officialClassification = result.payload;
        sources.push({ ...cached, authority: 'runtime-reference' });
      } catch (error) {
        warnings.push(`Official cClassTrib validation failed: ${error instanceof Error ? error.message : String(error)}`);
        missing.push('verified_tax_classification');
      }
    }

    if (!dto.cst) missing.push('cst');
    if (!dto.operation_indicator) missing.push('operation_indicator');
    if (dto.tax_treatment === 'unknown') missing.push('tax_treatment');
    if (dto.tax_treatment === 'differentiated' || dto.tax_treatment === 'special') warnings.push('Differentiated/special treatment must be calculated from the applicable official classification/rules; TaxAgent will not apply standard rates automatically.');

    const reference = calculate2026StandardReference(dto.amount, dto.effective_at, dto.tax_treatment);
    if (reference) {
      sources.push({ dataset: 'transition-2026', authority: 'official-law-guidance', url: 'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/entenda', rates: { ibs: 0.001, cbs: 0.009 } });
      warnings.push('2026 values are test-year reference amounts; applicability and effective rates still depend on the operation classification and current official rules.');
    }

    const status: 'resolved' | 'requires_input' = missing.length ? 'requires_input' : 'resolved';
    const output = {
      status,
      effective_at: dto.effective_at,
      classification: {
        nbs: dto.nbs,
        national_service_code: dto.national_service_code,
        cIndOp: dto.operation_indicator,
        cst: dto.cst,
        cClassTrib: dto.tax_classification,
        tax_treatment: dto.tax_treatment,
        official: officialClassification,
        candidates,
      },
      calculation: reference ?? { kind: 'official-rules-required', referenceOnly: true, message: 'No automatic amount calculation was performed for this treatment/year.' },
      missing,
      warnings,
      policy: { ai_authoritative: false, annexVIII_authoritative: false, deterministic_final_decision: true },
    };

    const id = createId('taxdec');
    await this.db.query(
      `INSERT INTO tax_decisions(id, company_id, effective_at, status, input, output, sources)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)`,
      [id, dto.company_id, dto.effective_at.slice(0, 10), status, JSON.stringify(dto), JSON.stringify(output), JSON.stringify(sources)],
    );
    return { id, ...output, sources };
  }
}
