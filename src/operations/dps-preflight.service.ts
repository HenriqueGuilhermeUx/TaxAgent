import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CertificateVaultService } from '../certificates/certificate-vault.service';
import { CanonicalService } from '../fiscal-core/fiscal.types';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';
import { SchemaRegistryService } from '../schema-registry/schema-registry.service';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import { TenancyService } from '../tenancy/tenancy.service';
import { DpsBuilderService, FiscalCompany } from '../xml-engine/dps-builder.service';
import { formatNfseDateTimeUtc } from '../xml-engine/nfse-datetime';
import { XmlSignatureService } from '../xml-engine/xml-signature.service';
import { XmlValidationService } from '../xml-engine/xml-validation.service';

interface PreparedDps {
  company: FiscalCompany;
  service: CanonicalService;
  built: { xml: string; id: string; sequence: number; series: string; verifiedLayout: boolean };
}

@Injectable()
export class DpsPreflightService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly taxEngine: TaxEngineService,
    private readonly builder: DpsBuilderService,
    private readonly validation: XmlValidationService,
    private readonly signature: XmlSignatureService,
    private readonly vault: CertificateVaultService,
    private readonly schemas: SchemaRegistryService,
  ) {}

  async prebuild(dto: CreateInvoiceDto) {
    const prepared = await this.prepareUnsigned(dto);
    return {
      valid: true,
      signed: false,
      transmitted: false,
      certificate_required: false,
      environment: 'test',
      tax_decision_id: dto.tax_decision_id,
      dps_id: prepared.built.id,
      preview_sequence: prepared.built.sequence,
      schema: this.schemas.active('test').id,
      unsigned_xml_sha256: this.hash(prepared.built.xml),
      builder_mode: process.env.TAXAGENT_DPS_BUILDER_MODE ?? 'draft',
      fiscal_summary: {
        national_service_code: prepared.service.nationalServiceCode,
        service_location_city_code: prepared.service.serviceLocationCityCode,
        iss_taxation: prepared.service.issTaxation,
        iss_withholding: prepared.service.issWithholding,
        iss_rate: prepared.service.issRate,
        cIndOp: prepared.service.operationIndicator,
        cst: prepared.service.taxSituation,
        cClassTrib: prepared.service.taxClassification,
      },
      checked_at: new Date().toISOString(),
      note: 'The unsigned DPS was built from the persisted tax decision and validated against the active Produção Restrita XSD. Certificate Vault, XMLDSig and SEFIN were not used.',
    };
  }

  async validate(dto: CreateInvoiceDto) {
    const prepared = await this.prepareUnsigned(dto);
    const certificate = await this.vault.getActiveMaterial(dto.company_id);
    const signed = this.signature.sign(prepared.built.xml, prepared.built.id, 'infDPS', certificate);
    await this.validation.validateWellFormed(signed);
    await this.validation.validateStrict(signed, 'test');
    return {
      valid: true,
      signed: true,
      transmitted: false,
      environment: 'test',
      tax_decision_id: dto.tax_decision_id,
      dps_id: prepared.built.id,
      preview_sequence: prepared.built.sequence,
      schema: this.schemas.active('test').id,
      unsigned_xml_sha256: this.hash(prepared.built.xml),
      signed_xml_sha256: this.hash(signed),
      certificate_fingerprint: certificate.fingerprint,
      builder_mode: process.env.TAXAGENT_DPS_BUILDER_MODE ?? 'draft',
      checked_at: new Date().toISOString(),
      note: 'The DPS was built from a persisted tax decision, XSD-validated, signed with the active A1 and XSD-validated again. No request was sent to SEFIN.',
    };
  }

  private async prepareUnsigned(dto: CreateInvoiceDto): Promise<PreparedDps> {
    if (dto.environment !== 'test') throw new BadRequestException('DPS dry-run is restricted to environment=test during the first homologation cycle');
    if (!dto.tax_decision_id) throw new BadRequestException('DPS prebuild/dry-run requires a resolved tax_decision_id so RTC fields are traceable to a persisted TaxAgent decision');
    const company = await this.tenancy.getCompany(dto.company_id) as FiscalCompany;
    let service: CanonicalService = {
      description: dto.service.description,
      amount: dto.service.amount,
      nationalServiceCode: dto.service.national_service_code,
      serviceLocationCityCode: dto.service.service_location_city_code,
      issTaxation: dto.service.iss_taxation,
      issWithholding: dto.service.iss_withholding,
      issRate: dto.service.iss_rate,
      finalConsumption: dto.service.final_consumption,
      operationIndicator: dto.service.operation_indicator,
      taxSituation: dto.service.tax_situation,
      taxClassification: dto.service.tax_classification,
    };
    service = await this.taxEngine.hydrateServiceFromDecision(dto.company_id, dto.tax_decision_id, service);
    this.assertLiveInputs(company, service);
    const issuedAt = formatNfseDateTimeUtc();
    const input = this.taxEngine.validate({
      companyId: dto.company_id,
      environment: 'test',
      competence: dto.competence ?? issuedAt.slice(0, 10),
      issuedAt,
      customer: { taxId: dto.customer.tax_id, name: dto.customer.name, cityCode: dto.customer.city_code },
      service,
    });
    const built = this.builder.buildPreview(input, company, 1);
    await this.validation.validateWellFormed(built.xml);
    await this.validation.validateStrict(built.xml, 'test');
    return { company, service, built };
  }

  private hash(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private assertLiveInputs(company: FiscalCompany, service: CanonicalService) {
    if (String(company.tax_regime ?? '').toLowerCase() !== 'regular') throw new BadRequestException('First homologation cycle supports tax_regime=regular only');
    if (!service.nationalServiceCode || !/^\d{6}$/.test(service.nationalServiceCode)) throw new BadRequestException('national_service_code must be a 6-digit cTribNac');
    if (!service.serviceLocationCityCode) throw new BadRequestException('service_location_city_code is required for dry-run');
    if (!service.issTaxation || !service.issWithholding) throw new BadRequestException('iss_taxation and iss_withholding are required for dry-run');
    if (!service.operationIndicator || !service.taxSituation || !service.taxClassification) throw new BadRequestException('cIndOp, CST and cClassTrib are required for dry-run');
  }
}
