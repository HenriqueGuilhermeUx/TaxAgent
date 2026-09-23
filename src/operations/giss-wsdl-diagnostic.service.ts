import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { CertificateVaultService } from '../certificates/certificate-vault.service';
import { FiscalEngineError } from '../fiscal-core/fiscal-engine.error';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { GissClient } from '../providers/giss/giss.client';
import { TenancyService } from '../tenancy/tenancy.service';

const SAFE_GISS_DETAIL_KEYS = [
  'transmission_attempted',
  'query_attempted',
  'network_attempted',
  'reachable',
  'is_wsdl',
  'operation_present',
  'shape_present',
  'transport_present',
  'request_bytes',
] as const;

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
    try {
      const result = await this.giss.inspectWsdl(cityCode, material);
      return {
        ...result,
        environment,
        city_code: cityCode,
        certificate_fingerprint: material.fingerprint,
        network_method: 'GET',
        fiscal_transmission_attempted: false,
        query_attempted: false,
        certificate_private_material_exposed: false,
        response_body_exposed: false,
      };
    } catch (error) {
      throw this.safeUpstreamFailure(error, 'authenticated_wsdl_get');
    }
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
    let prepared;
    try {
      prepared = await this.giss.prepareRpsQuery(
        cityCode,
        {
          providerTaxId: company.tax_id,
          municipalRegistration: company.municipal_registration,
          number,
          series,
        },
        material,
      );
    } catch (error) {
      throw this.safeUpstreamFailure(error, 'authenticated_wsdl_get_and_contract');
    }

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

  private safeUpstreamFailure(error: unknown, stage: 'authenticated_wsdl_get' | 'authenticated_wsdl_get_and_contract') {
    const common = {
      stage,
      fiscal_transmission_attempted: false,
      query_attempted: false,
      certificate_private_material_exposed: false,
      request_body_exposed: false,
    };

    if (error instanceof FiscalEngineError) {
      return new BadGatewayException({
        ...common,
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        details: this.safeDetails(error.details),
      });
    }

    const networkCode = typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : undefined;

    return new BadGatewayException({
      ...common,
      code: 'TA_GISS_WSDL_DIAGNOSTIC_FAILED',
      message: 'Authenticated GISS WSDL diagnostic failed before any fiscal POST.',
      retryable: true,
      error_name: error instanceof Error ? error.name : 'UnknownError',
      ...(networkCode ? { network_code: networkCode } : {}),
    });
  }

  private safeDetails(details: unknown) {
    if (!details || typeof details !== 'object' || Array.isArray(details)) return undefined;
    const source = details as Record<string, unknown>;
    const safe: Record<string, unknown> = {};
    for (const key of SAFE_GISS_DETAIL_KEYS) {
      const value = source[key];
      if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') safe[key] = value;
    }
    return Object.keys(safe).length > 0 ? safe : undefined;
  }

  private assertTestEnvironment(environment: FiscalEnvironment) {
    if (environment !== 'test') throw new BadRequestException('GISS WSDL/query diagnostic is restricted to the test environment');
  }
}
