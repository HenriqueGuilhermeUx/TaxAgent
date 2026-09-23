import { BadRequestException, Injectable } from '@nestjs/common';
import { CertificateVaultService } from '../certificates/certificate-vault.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { MunicipalCapabilityService } from '../municipal-parameters/municipal-capability.service';
import { TenancyService } from '../tenancy/tenancy.service';

interface CompanyRecord {
  id: string;
  tax_id: string;
  city_code: string;
  tax_regime?: string | null;
}

@Injectable()
export class MunicipalityScenarioService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly vault: CertificateVaultService,
    private readonly capabilities: MunicipalCapabilityService,
  ) {}

  async inspect(companyId: string, environment: FiscalEnvironment, serviceCityCode: string, effectiveAt?: string) {
    if (!/^\d{7}$/.test(serviceCityCode)) throw new BadRequestException('serviceCityCode must contain 7 digits');
    if (effectiveAt && !/^\d{4}-\d{2}-\d{2}/.test(effectiveAt)) throw new BadRequestException('effectiveAt must start with YYYY-MM-DD');

    const company = await this.tenancy.getCompany(companyId) as CompanyRecord;
    const certificates = await this.vault.metadata(companyId) as Array<{
      status: string;
      certificate_fingerprint?: string;
      subject_tax_id?: string | null;
      valid_to?: Date | string | null;
    }>;
    const active = certificates.find((certificate) => certificate.status === 'active');

    const taxpayer = { taxRegime: company.tax_regime ?? undefined, effectiveAt };
    const issuerRoute = await this.capabilities.resolve(company.city_code, environment, taxpayer);
    const serviceMunicipalityCapability = serviceCityCode === company.city_code
      ? issuerRoute
      : await this.capabilities.resolve(serviceCityCode, environment, taxpayer);

    return {
      company_id: companyId,
      environment,
      certificate: active ? {
        reused_for_same_company: true,
        fingerprint: active.certificate_fingerprint ?? null,
        subject_tax_id: active.subject_tax_id ?? null,
        valid_to: active.valid_to ?? null,
      } : null,
      issuer_city_code: company.city_code,
      service_location_city_code: serviceCityCode,
      issuer_route: issuerRoute,
      service_municipality_capability: serviceMunicipalityCapability,
      safeguards: {
        issuer_override_applied: false,
        emission_route_uses_issuer_city: true,
        fiscal_transmission_attempted: false,
        certificate_private_material_exposed: false,
      },
      note: serviceCityCode === company.city_code
        ? 'Service location equals issuer municipality.'
        : 'Cross-municipality scenario only: service location does not replace the issuer municipality or its fiscal provider.',
    };
  }
}
