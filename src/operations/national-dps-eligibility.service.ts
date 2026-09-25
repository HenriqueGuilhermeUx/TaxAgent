import { BadRequestException, Injectable } from '@nestjs/common';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';
import { MunicipalCapabilityService } from '../municipal-parameters/municipal-capability.service';
import { TenancyService } from '../tenancy/tenancy.service';

interface CompanyRecord {
  city_code: string;
  tax_regime?: string | null;
}

@Injectable()
export class NationalDpsEligibilityService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly capabilities: MunicipalCapabilityService,
  ) {}

  assertPreparedDpsAllowed(dto: CreateInvoiceDto) {
    return this.assertCompanyAllowed(dto.company_id, dto.environment, dto.competence);
  }

  async assertCompanyAllowed(companyId: string, environment: FiscalEnvironment, effectiveAt?: string) {
    if (environment !== 'test') {
      throw new BadRequestException('National DPS signing/prepare eligibility is restricted to environment=test during homologation');
    }
    const company = await this.tenancy.getCompany(companyId) as CompanyRecord;
    const route = await this.capabilities.resolve(company.city_code, environment, {
      taxRegime: company.tax_regime ?? undefined,
      effectiveAt,
    });
    if (route.route !== 'national-direct' || route.provider !== 'nfse-national' || !route.nationalPublicIssuer) {
      throw new BadRequestException({
        code: 'TA_NATIONAL_DPS_ISSUER_NOT_ELIGIBLE',
        message: 'National DPS preparation/signing is allowed only when the persisted issuer municipality/taxpayer route is proven as national-direct. TaxAgent will not create an A1-signed national DPS for a municipal-provider or unresolved issuer.',
        issuer_city_code: company.city_code,
        resolved_route: route.route,
        resolved_provider: route.provider,
        national_public_issuer: route.nationalPublicIssuer,
        dps_sequence_consumed: false,
        dps_signed: false,
        fiscal_transmission_attempted: false,
      });
    }
    return route;
  }
}
