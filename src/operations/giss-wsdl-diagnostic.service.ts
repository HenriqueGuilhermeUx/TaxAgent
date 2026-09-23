import { BadRequestException, Injectable } from '@nestjs/common';
import { CertificateVaultService } from '../certificates/certificate-vault.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { GissClient } from '../providers/giss/giss.client';
import { TenancyService } from '../tenancy/tenancy.service';

@Injectable()
export class GissWsdlDiagnosticService {
  constructor(
    private readonly vault: CertificateVaultService,
    private readonly giss: GissClient,
    private readonly tenancy: TenancyService,
  ) {}

  async inspect(companyId: string, environment: FiscalEnvironment, cityCode: string) {
    this.assertTestEnvironment(environment);
    const material = await this.vault.getActiveMaterial(companyId);
    const result = await this.giss.inspectWsdl(cityCode, material);
    return {
      ...result,
      environment,
      city_code: cityCode,
      certificate_fingerprint: material.fingerprint,
      network_method: 'GET',
      fiscal_transmission_attempted: false,
    };
  }

  async prepareQuery(
    companyId: string,
    environment: FiscalEnvironment,
    cityCode: string,
    number = '1',
    series = 'TA',
  ) {
    this.assertTestEnvironment(environment);
    const company = await this.tenancy.getCompany(companyId);
    if (company.city_code !== cityCode) {
      throw new BadRequestException('GISS reconciliation diagnostic must use the Company issuer city; service-location city cannot replace issuer city');
    }

    const material = await this.vault.getActiveMaterial(companyId);
    const prepared = await this.giss.prepareRpsQuery(
      cityCode,
      {
        providerTaxId: company.tax_id,
        municipalRegistration: company.municipal_registration,
        number,
        series,
      },
      material,
    );

    const body = prepared.body;
    return {
      environment,
      city_code: cityCode,
      issuer_city_code: company.city_code,
      endpoint: prepared.soapAddress,
      action: prepared.soapAction,
      soap_version: prepared.soapVersion,
      namespace: prepared.targetNamespace,
      request_wrapper: prepared.requestWrapper,
      request_sha256: prepared.bodySha256,
      request_bytes: prepared.bodyBytes,
      certificate_fingerprint: material.fingerprint,
      rps_identity: {
        number,
        series,
        provider_tax_id_source: 'company',
        municipal_registration_included: Boolean(company.municipal_registration),
      },
      shape: {
        soap_envelope: /<(?:soap|soapenv):Envelope\b/i.test(body),
        request_wrapper: body.includes('<ConsultarNfsePorRpsRequest'),
        nfse_cabec_msg: body.includes('<nfseCabecMsg>'),
        nfse_dados_msg: body.includes('<nfseDadosMsg>'),
        consultar_nfse_rps_envio: body.includes('<ConsultarNfseRpsEnvio'),
      },
      network_method: 'GET',
      wsdl_authenticated_with_a1: true,
      fiscal_transmission_attempted: prepared.fiscalTransmissionAttempted,
      query_attempted: prepared.queryAttempted,
      certificate_private_material_exposed: false,
      request_body_exposed: false,
    };
  }

  private assertTestEnvironment(environment: FiscalEnvironment) {
    if (environment !== 'test') throw new BadRequestException('GISS WSDL/query diagnostic is restricted to the test environment');
  }
}
