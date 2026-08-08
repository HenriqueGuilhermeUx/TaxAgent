import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CertificateVaultService } from '../certificates/certificate-vault.service';
import { CanonicalService } from '../fiscal-core/fiscal.types';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';
import { SchemaRegistryService } from '../schema-registry/schema-registry.service';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import { TenancyService } from '../tenancy/tenancy.service';
import { DpsBuilderService, FiscalCompany } from '../xml-engine/dps-builder.service';
import { XmlSignatureService } from '../xml-engine/xml-signature.service';
import { XmlValidationService } from '../xml-engine/xml-validation.service';

@Injectable()
export class DpsPreflightService {
  constructor(private readonly tenancy: TenancyService, private readonly taxEngine: TaxEngineService, private readonly builder: DpsBuilderService, private readonly validation: XmlValidationService, private readonly signature: XmlSignatureService, private readonly vault: CertificateVaultService, private readonly schemas: SchemaRegistryService) {}

  async validate(dto: CreateInvoiceDto) {
    if (dto.environment !== 'test') throw new BadRequestException('DPS dry-run is restricted to environment=test during the first homologation cycle');
    const company = await this.tenancy.getCompany(dto.company_id) as FiscalCompany;
    let service: CanonicalService = {
      description: dto.service.description,
      amount: dto.service.amount,
      nationalServiceCode: dto.service.national_service_code,
      serviceLocationCityCode: dto.service.service_location_city_code,
      issTaxation: dto.service.iss_taxation,
      issWithholding: dto.service.iss_withholding,
      issRate: dto.service.iss_rate,
      operationIndicator: dto.service.operation_indicator,
      taxSituation: dto.service.tax_situation,
      taxClassification: dto.service.tax_classification,
    };
    if (dto.tax_decision_id) service = await this.taxEngine.hydrateServiceFromDecision(dto.company_id, dto.tax_decision_id, service);
    this.assertLiveInputs(company, service);
    const issuedAt = new Date().toISOString();
    const input = this.taxEngine.validate({ companyId: dto.company_id, environment: 'test', competence: dto.competence ?? issuedAt.slice(0, 10), issuedAt, customer: { taxId: dto.customer.tax_id, name: dto.customer.name, cityCode: dto.customer.city_code }, service });
    const built = this.builder.buildPreview(input, company, 1);
    await this.validation.validateWellFormed(built.xml);
    await this.validation.validateStrict(built.xml, 'test');
    const certificate = await this.vault.getActiveMaterial(dto.company_id);
    const signed = this.signature.sign(built.xml, built.id, 'infDPS', certificate);
    await this.validation.validateWellFormed(signed);
    await this.validation.validateStrict(signed, 'test');
    const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
    return {
      valid: true,
      transmitted: false,
      environment: 'test',
      dps_id: built.id,
      preview_sequence: built.sequence,
      schema: this.schemas.active('test').id,
      unsigned_xml_sha256: hash(built.xml),
      signed_xml_sha256: hash(signed),
      certificate_fingerprint: certificate.fingerprint,
      builder_mode: process.env.TAXAGENT_DPS_BUILDER_MODE ?? 'draft',
      checked_at: new Date().toISOString(),
      note: 'The DPS was built, XSD-validated, signed with the active A1 and XSD-validated again. No request was sent to SEFIN.',
    };
  }

  private assertLiveInputs(company: FiscalCompany, service: CanonicalService) {
    if (String(company.tax_regime ?? '').toLowerCase() !== 'regular') throw new BadRequestException('First homologation cycle supports tax_regime=regular only');
    if (!service.nationalServiceCode || !/^\d{6}$/.test(service.nationalServiceCode)) throw new BadRequestException('national_service_code must be a 6-digit cTribNac');
    if (!service.serviceLocationCityCode) throw new BadRequestException('service_location_city_code is required for dry-run');
    if (!service.issTaxation || !service.issWithholding) throw new BadRequestException('iss_taxation and iss_withholding are required for dry-run');
    if (!service.operationIndicator || !service.taxSituation || !service.taxClassification) throw new BadRequestException('cIndOp, CST and cClassTrib are required for dry-run');
  }
}
