import { BadRequestException, Injectable } from '@nestjs/common';
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

  async assertPreparedDpsAllowed(dto: CreateInvoiceDto) {
    if (dto.environment !== 'test') {
      throw new BadRequestException('Prepared DPS national eligibility is restricted to environment=test during homologation');
    }
    const company = await this.tenancy.getCompany(dto.company_id) as CompanyRecord;
    const route = await this.capabilities.resolve(company.city_code, dto.environment, {
      taxRegime: company.tax_regime ?? undefined,
      effectiveAt: dto.competence,
    });
    if (route.route !== 'national-direct' || route.provider !== 'nfse-national' || !route.nationalPublicIssuer) {
      throw new BadRequestException({
        code: 'TA_NATIONAL_DPS_ISSUER_NOT_ELIGIBLE',
        message: 'Prepared DPS is allowed only when the persisted issuer municipality/taxpayer route is proven as national-direct. TaxAgent will not consume a DPS sequence for a municipal-provider or unresolved issuer.',
        issuer_city_code: company.city_code,
        resolved_route: route.route,
        resolved_provider: route.provider,
        national_public_issuer: route.nationalPublicIssuer,
        dps_sequence_consumed: false,
        fiscal_transmission_attempted: false,
      });
    }
    return route;
  }
}
