import { Injectable } from '@nestjs/common';
import { CertificateVaultService } from '../certificates/certificate-vault.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { MunicipalCapabilityService } from '../municipal-parameters/municipal-capability.service';
import { SchemaRegistryService } from '../schema-registry/schema-registry.service';
import { TenancyService } from '../tenancy/tenancy.service';

interface CompanyRecord {
  id: string;
  tax_id: string;
  city_code: string;
  tax_regime?: string | null;
  municipal_registration?: string | null;
}

@Injectable()
export class IssuerReadinessService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly certificates: CertificateVaultService,
    private readonly capabilities: MunicipalCapabilityService,
    private readonly schemas: SchemaRegistryService,
  ) {}

  async inspect(companyId: string, environment: FiscalEnvironment, effectiveAt?: string) {
    const company = await this.tenancy.getCompany(companyId) as CompanyRecord;
    const taxRegime = String(company.tax_regime ?? '').trim().toLowerCase() || 'unknown';
    const effectiveDate = (effectiveAt ?? new Date().toISOString()).slice(0, 10);
    const route = await this.capabilities.resolve(company.city_code, environment, {
      taxRegime: taxRegime === 'unknown' ? undefined : taxRegime,
      effectiveAt: effectiveDate,
    });

    const certificateMetadata = await this.certificates.metadata(companyId) as Array<{
      status: string;
      valid_to?: Date | string | null;
      subject_tax_id?: string | null;
    }>;
    const activeCertificate = certificateMetadata.find((item) => item.status === 'active');
    const certificateValidTo = activeCertificate?.valid_to ? new Date(activeCertificate.valid_to) : undefined;
    const certificateValid = Boolean(certificateValidTo && Number.isFinite(certificateValidTo.getTime()) && certificateValidTo.getTime() > Date.now());
    const certificateCompanyBinding = Boolean(
      activeCertificate
      && normalizeTaxId(activeCertificate.subject_tax_id ?? '') === normalizeTaxId(company.tax_id),
    );

    const dpsConformance = this.schemas.dpsConformance(environment);
    const eventConformance = this.schemas.eventConformance(environment);
    const liveBuilderTaxRegimeSupported = taxRegime === 'regular';
    const blockers: string[] = [];

    if (environment !== 'test') blockers.push('homologation_environment_required');
    if (route.route !== 'national-direct' || route.provider !== 'nfse-national' || !route.nationalPublicIssuer) blockers.push('issuer_route_not_national_direct');
    if (!activeCertificate || !certificateValid) blockers.push('active_a1_required');
    if (!certificateCompanyBinding) blockers.push('certificate_company_binding_required');
    if (!dpsConformance.verified) blockers.push('dps_conformance_required');
    if (!eventConformance.verified) blockers.push('event_conformance_required');
    if (!liveBuilderTaxRegimeSupported) blockers.push('tax_regime_not_yet_supported_by_live_dps_builder');

    const result = {
      company_id: companyId,
      environment,
      effective_at: effectiveDate,
      issuer_city_code: company.city_code,
      tax_regime: taxRegime,
      municipal_registration_present: Boolean(company.municipal_registration),
      route: {
        resolved_route: route.route,
        resolved_provider: route.provider,
        national_public_issuer: route.nationalPublicIssuer,
        source: route.source,
      },
      certificate: {
        active: Boolean(activeCertificate),
        valid: certificateValid,
        company_binding: certificateCompanyBinding,
      },
      conformance: {
        dps_verified: dpsConformance.verified,
        cancellation_event_verified: eventConformance.verified,
      },
      live_builder_tax_regime_supported: liveBuilderTaxRegimeSupported,
      eligible_for_national_test_issuance: blockers.length === 0,
      blockers,
      safeguards: {
        fiscal_transmission_attempted: false,
        fiscal_emission_attempted: false,
        certificate_private_material_exposed: false,
        company_tax_id_exposed: false,
      },
    };

    // Safe operational diagnostic. No CNPJ, certificate bytes, API key, XML or taxpayer payload is logged.
    console.log(JSON.stringify({
      event: 'issuer_readiness_result',
      company_id: companyId,
      environment,
      effective_at: effectiveDate,
      issuer_city_code: company.city_code,
      tax_regime: taxRegime,
      resolved_route: route.route,
      resolved_provider: route.provider,
      national_public_issuer: route.nationalPublicIssuer,
      certificate_active: Boolean(activeCertificate),
      certificate_valid: certificateValid,
      certificate_company_binding: certificateCompanyBinding,
      dps_conformance_verified: dpsConformance.verified,
      event_conformance_verified: eventConformance.verified,
      live_builder_tax_regime_supported: liveBuilderTaxRegimeSupported,
      eligible_for_national_test_issuance: blockers.length === 0,
      blockers,
      fiscal_transmission_attempted: false,
      fiscal_emission_attempted: false,
    }));

    return result;
  }
}

function normalizeTaxId(value: string): string {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}
