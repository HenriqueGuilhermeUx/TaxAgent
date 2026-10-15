import { BadRequestException, Injectable } from '@nestjs/common';
import { CertificateVaultService } from '../certificates/certificate-vault.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { MunicipalParametersClient } from '../municipal-parameters/municipal-parameters.client';
import { NfseNationalClient } from '../providers/nfse-national/nfse-national.client';
import { nfseEndpointPolicy } from '../providers/nfse-national/nfse-endpoints';
import { TenancyService } from '../tenancy/tenancy.service';

interface CompanyRecord {
  tax_id: string;
  city_code: string;
}

@Injectable()
export class NationalPreflightService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly vault: CertificateVaultService,
    private readonly nfse: NfseNationalClient,
    private readonly parameters: MunicipalParametersClient,
  ) {}

  async probe(companyId: string, environment: FiscalEnvironment, targetCityCode: string) {
    if (environment !== 'test') throw new BadRequestException('National A1 preflight is restricted to the test environment');
    if (!/^\d{7}$/.test(targetCityCode)) throw new BadRequestException('targetCityCode must contain 7 digits');

    const company = await this.tenancy.getCompany(companyId) as CompanyRecord;
    const material = await this.vault.getActiveMaterial(companyId);
    const companyTaxId = normalizeTaxId(company.tax_id);
    const certificateTaxId = normalizeTaxId(material.subjectTaxId ?? '');
    const certificateBoundToCompany = certificateTaxId.length === 14 && certificateTaxId === companyTaxId;
    if (!certificateBoundToCompany) {
      throw new BadRequestException({
        code: 'TA_NATIONAL_CERTIFICATE_COMPANY_MISMATCH',
        message: 'Active A1 certificate is not bound to the Company CNPJ; national preflight stopped before network access.',
        network_attempted: false,
        fiscal_transmission_attempted: false,
      });
    }

    const endpoint = nfseEndpointPolicy(environment);
    const tls = await this.nfse.probeMutualTls(environment, material);
    const convention = await this.parameters.getConvention(environment, targetCityCode, material);

    const result = {
      company_id: companyId,
      environment,
      issuer_city_code: company.city_code,
      target_city_code: targetCityCode,
      certificate_company_binding: true,
      national_endpoint: {
        official: endpoint.official,
        expected_host: endpoint.expectedHost,
        expected_path: endpoint.expectedPath,
      },
      mtls: tls,
      municipality_parameters: {
        http_status: convention.status,
        municipality_present: convention.supported,
      },
      safeguards: {
        issuer_override_applied: false,
        target_city_used_as_issuer: false,
        network_methods: ['TLS_HANDSHAKE', 'GET'],
        dps_built: false,
        fiscal_transmission_attempted: false,
        fiscal_emission_attempted: false,
        certificate_private_material_exposed: false,
      },
      note: 'Transport and municipal-parameter preflight only. A target municipality being present in national parameters does not prove that this Company may issue there.',
    };

    console.log(JSON.stringify({
      event: 'national_a1_preflight_result',
      company_id: companyId,
      issuer_city_code: company.city_code,
      target_city_code: targetCityCode,
      endpoint_official: endpoint.official,
      mtls_authorized: tls.authorized,
      mtls_protocol: tls.protocol,
      municipality_http_status: convention.status,
      municipality_present: convention.supported,
      fiscal_emission_attempted: false,
    }));

    return result;
  }
}

function normalizeTaxId(value: string): string {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
