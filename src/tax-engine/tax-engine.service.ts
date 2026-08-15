import { BadRequestException, Injectable } from '@nestjs/common';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { CanonicalService, CanonicalInvoiceInput } from '../fiscal-core/fiscal.types';
import { ResolveTaxDto } from './dto/resolve-tax.dto';
import { RtcOpenDataClient } from './rtc-open-data.client';
import { resolveServiceProfile } from './service-profile-rules';
import { TaxDomainRegistryService } from './tax-domain-registry.service';
import { TaxPositionService } from './tax-position.service';
import { calculate2026StandardReference } from './tax-rules';

@Injectable()
export class TaxEngineService {
  constructor(private readonly db: DatabaseService, private readonly rtc: RtcOpenDataClient, private readonly domains: TaxDomainRegistryService, private readonly position: TaxPositionService) {}

  validate(input: CanonicalInvoiceInput): CanonicalInvoiceInput {
    if (!input.companyId) throw new BadRequestException('companyId is required');
    if (!input.customer.taxId || !input.customer.name) throw new BadRequestException('Customer identity is required');
    if (!/^\d{7}$/.test(input.customer.cityCode)) throw new BadRequestException('customer.cityCode must be a 7-digit IBGE code');
    if (input.service.serviceLocationCityCode && !/^\d{7}$/.test(input.service.serviceLocationCityCode)) throw new BadRequestException('service.serviceLocationCityCode must be a 7-digit IBGE code');
    if (!input.service.description.trim()) throw new BadRequestException('Service description is required');
    if (!Number.isFinite(input.service.amount) || input.service.amount <= 0) throw new BadRequestException('Service amount must be positive');
    return input;
  }

  async hydrateServiceFromDecision(companyId: string, decisionId: string, service: CanonicalService): Promise<CanonicalService> {
    const decision = await this.position.getDecision(decisionId, companyId);
    if (decision.status !== 'resolved') throw new BadRequestException('Tax decision must be resolved before it can be bound to an invoice');
    const classification = decision.output?.classification ?? {};
    const municipalTax = decision.output?.municipal_tax ?? {};
    const resolved = {
      operationIndicator: classification.cIndOp as string | undefined,
      taxSituation: classification.cst as string | undefined,
      taxClassification: classification.cClassTrib as string | undefined,
      nationalServiceCode: classification.national_service_code as string | undefined,
      issTaxation: municipalTax.iss_taxation as CanonicalService['issTaxation'] | undefined,
      issWithholding: municipalTax.iss_withholding as CanonicalService['issWithholding'] | undefined,
      issRate: typeof municipalTax.iss_rate === 'number' ? municipalTax.iss_rate as number : undefined,
    };
    this.assertNoConflict('operation_indicator', service.operationIndicator, resolved.operationIndicator);
    this.assertNoConflict('tax_situation', service.taxSituation, resolved.taxSituation);
    this.assertNoConflict('tax_classification', service.taxClassification, resolved.taxClassification);
    this.assertNoConflict('national_service_code', service.nationalServiceCode, resolved.nationalServiceCode);
    this.assertNoConflict('iss_taxation', service.issTaxation, resolved.issTaxation);
    this.assertNoConflict('iss_withholding', service.issWithholding, resolved.issWithholding);
    this.assertNoNumericConflict('iss_rate', service.issRate, resolved.issRate);
    return {
      ...service,
      operationIndicator: service.operationIndicator ?? resolved.operationIndicator,
      taxSituation: service.taxSituation ?? resolved.taxSituation,
      taxClassification: service.taxClassification ?? resolved.taxClassification,
      nationalServiceCode: service.nationalServiceCode ?? resolved.nationalServiceCode,
      issTaxation: service.issTaxation ?? resolved.issTaxation,
      issWithholding: service.issWithholding ?? resolved.issWithholding,
      issRate: service.issRate ?? resolved.issRate,
    };
  }

  async resolve(dto: ResolveTaxDto) {
    const missing: string[] = [];
    const warnings: string[] = [];
    const sources: Array<Record<string, unknown>> = [];
    let officialClassification: unknown;
    let candidates: unknown;

    const profile = dto.service_profile
      ? resolveServiceProfile({
          profile: dto.service_profile,
          issuerCityCode: dto.issuer_city_code,
          destinationCityCode: dto.destination_city_code,
          issWithholding: dto.iss_withholding,
        })
      : undefined;

    if (profile) {
      for (const item of profile.missing) this.addMissing(missing, item);
      sources.push(...profile.sources);
    }

    const nationalServiceCode = this.mergeProfileField('national_service_code', dto.national_service_code, profile?.classification.national_service_code);
    const operationIndicator = this.mergeProfileField('operation_indicator', dto.operation_indicator, profile?.classification.cIndOp);
    const cst = this.mergeProfileField('cst', dto.cst, profile?.classification.cst);
    const taxClassification = this.mergeProfileField('tax_classification', dto.tax_classification, profile?.classification.cClassTrib);
    const taxTreatment = this.mergeProfileField('tax_treatment', dto.tax_treatment, profile?.classification.tax_treatment) ?? 'unknown';

    if (!taxClassification) {
      this.addMissing(missing, 'tax_classification');
      if (dto.nbs) {
        try {
          const result = await this.rtc.getClassificationsByNbs(dto.nbs, dto.effective_at);
          const cached = await this.domains.cacheRecord('rtc-classifications-by-nbs', `${dto.nbs}@${dto.effective_at.slice(0, 10)}`, result, 24);
          candidates = result.payload;
          sources.push({ ...cached, authority: 'runtime-reference' });
        } catch (error) {
          warnings.push(`Could not fetch official NBS classification candidates: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } else {
      try {
        const result = await this.rtc.getClassificationForNfse(taxClassification, dto.effective_at);
        const cached = await this.domains.cacheRecord('rtc-nfse-cclasstrib', `${taxClassification}@${dto.effective_at.slice(0, 10)}`, result, 24);
        officialClassification = result.payload;
        sources.push({ ...cached, authority: 'runtime-reference' });
      } catch (error) {
        warnings.push(`Official cClassTrib validation failed: ${error instanceof Error ? error.message : String(error)}`);
        this.addMissing(missing, 'verified_tax_classification');
      }
    }

    if (!cst) this.addMissing(missing, 'cst');
    if (!operationIndicator) this.addMissing(missing, 'operation_indicator');
    if (taxTreatment === 'unknown') this.addMissing(missing, 'tax_treatment');
    if (taxTreatment === 'differentiated' || taxTreatment === 'special') {
      warnings.push('Differentiated/special treatment must be calculated from the applicable official classification/rules; TaxAgent will not apply standard rates automatically.');
    }

    const reference = calculate2026StandardReference(dto.amount, dto.effective_at, taxTreatment);
    if (reference) {
      sources.push({
        dataset: 'transition-2026',
        authority: 'official-law-guidance',
        url: 'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/entenda',
        rates: { ibs: 0.001, cbs: 0.009 },
      });
      warnings.push('2026 values are test-year reference amounts; applicability and effective rates still depend on the operation classification and current official rules.');
    }

    const status: 'resolved' | 'requires_input' = missing.length ? 'requires_input' : 'resolved';
    const output = {
      status,
      effective_at: dto.effective_at,
      service_profile: profile?.profile,
      classification: {
        nbs: dto.nbs,
        national_service_code: nationalServiceCode,
        cIndOp: operationIndicator,
        cst,
        cClassTrib: taxClassification,
        tax_treatment: taxTreatment,
        official: officialClassification,
        candidates,
      },
      municipal_tax: profile?.municipal_tax,
      calculation: reference ?? { kind: 'official-rules-required', referenceOnly: true, message: 'No automatic amount calculation was performed for this treatment/year.' },
      missing,
      warnings,
      policy: { ai_authoritative: false, annexVIII_authoritative: false, deterministic_final_decision: true },
    };
    const id = createId('taxdec');
    await this.db.query(
      `INSERT INTO tax_decisions(id, company_id, effective_at, status, input, output, sources) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)`,
      [id, dto.company_id, dto.effective_at.slice(0, 10), status, JSON.stringify(dto), JSON.stringify(output), JSON.stringify(sources)],
    );
    return { id, ...output, sources };
  }

  private mergeProfileField<T extends string>(field: string, explicit: T | undefined, profiled: T | undefined): T | undefined {
    if (explicit && profiled && explicit !== profiled) throw new BadRequestException(`${field} conflicts with selected TaxAgent service profile`);
    return explicit ?? profiled;
  }

  private addMissing(missing: string[], value: string): void {
    if (!missing.includes(value)) missing.push(value);
  }

  private assertNoConflict(field: string, explicit: string | undefined, resolved: string | undefined): void {
    if (explicit && resolved && explicit !== resolved) throw new BadRequestException(`${field} conflicts with bound TaxAgent tax decision`);
  }

  private assertNoNumericConflict(field: string, explicit: number | undefined, resolved: number | undefined): void {
    if (explicit !== undefined && resolved !== undefined && Math.abs(explicit - resolved) > 0.000001) {
      throw new BadRequestException(`${field} conflicts with bound TaxAgent tax decision`);
    }
  }
}
