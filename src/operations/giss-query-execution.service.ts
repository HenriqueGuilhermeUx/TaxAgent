import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CertificateVaultService } from '../certificates/certificate-vault.service';
import { DatabaseService } from '../database/database.service';
import { FiscalDocumentsService } from '../documents/fiscal-documents.service';
import { FiscalEngineError } from '../fiscal-core/fiscal-engine.error';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { FiscalLedgerService } from '../ledger/fiscal-ledger.service';
import { GissArtifactsService } from '../providers/giss/giss-artifacts.service';
import { GissClient } from '../providers/giss/giss.client';
import { classifyGissReconciliation } from '../providers/giss/giss-reconciliation-classifier';
import { parseGissResponse } from '../providers/giss/giss-response.parser';
import { TenancyService } from '../tenancy/tenancy.service';

interface InvoiceRow {
  id: string;
  company_id: string;
  environment: FiscalEnvironment;
}

interface RpsMetadata {
  rps_number?: unknown;
  series?: unknown;
}

@Injectable()
export class GissQueryExecutionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly documents: FiscalDocumentsService,
    private readonly artifacts: GissArtifactsService,
    private readonly ledger: FiscalLedgerService,
    private readonly client: GissClient,
    private readonly vault: CertificateVaultService,
    private readonly tenancy: TenancyService,
  ) {}

  async execute(companyId: string, environment: FiscalEnvironment, invoiceId: string) {
    this.assertTestEnvironment(environment);

    const invoice = await this.getInvoice(invoiceId);
    if (invoice.company_id !== companyId) throw new BadRequestException('Invoice does not belong to the authenticated Company');
    if (invoice.environment !== environment) throw new BadRequestException('Invoice environment does not match requested environment');

    const company = await this.tenancy.getCompany(companyId);
    if (company.city_code !== '3548500') throw new BadRequestException('Current GISS reconciliation execution is restricted to Santos issuer municipality 3548500');
    const municipalRegistration = typeof company.municipal_registration === 'string' ? company.municipal_registration.trim() : '';
    if (!municipalRegistration) {
      await this.ledger.append({
        invoiceId,
        type: 'giss_reconciliation_query_blocked',
        payload: {
          provider: 'giss',
          operation: 'ConsultarNfsePorRps',
          code: 'TA_GISS_MUNICIPAL_REGISTRATION_REQUIRED',
          city_code: '3548500',
          query_attempted: false,
          fiscal_emission: false,
        },
      });
      throw new BadRequestException({
        code: 'TA_GISS_MUNICIPAL_REGISTRATION_REQUIRED',
        message: 'Santos GISS requires the issuer Municipal Registration for ConsultarNfsePorRps. TaxAgent will not call the provider until a real Municipal Registration is persisted for the Company.',
        query_attempted: false,
        fiscal_transmission_attempted: false,
        fiscal_emission_attempted: false,
      });
    }

    const rpsArtifact = await this.documents.latestContent(invoiceId, 'giss_rps_xml');
    if (!rpsArtifact) throw new BadRequestException('Invoice has no persisted GISS RPS artifact; reconciliation query will not guess an RPS identity');

    const metadata = (rpsArtifact.metadata ?? {}) as RpsMetadata;
    const number = typeof metadata.rps_number === 'string' || typeof metadata.rps_number === 'number' ? String(metadata.rps_number) : undefined;
    const series = typeof metadata.series === 'string' ? metadata.series : undefined;
    if (!number || !series) throw new BadRequestException('Persisted GISS RPS artifact is missing rps_number/series metadata; reconciliation query remains blocked');

    const material = await this.vault.getActiveMaterial(companyId);
    const prepared = await this.client.prepareRpsQuery(
      '3548500',
      {
        providerTaxId: company.tax_id,
        municipalRegistration,
        number,
        series,
      },
      material,
    );

    await this.artifacts.save(invoiceId, 'giss_soap_request', prepared.body, {
      purpose: 'reconciliation_query',
      operation: 'ConsultarNfsePorRps',
      rps_number: number,
      series,
      request_sha256: prepared.bodySha256,
      request_bytes: prepared.bodyBytes,
      soap_action: prepared.soapAction,
      soap_version: prepared.soapVersion,
      endpoint_host: new URL(prepared.soapAddress).hostname,
      query_data_signed: prepared.queryDataSigned,
      query_signature_profile: prepared.querySignatureProfile,
      fiscal_emission: false,
    });
    await this.ledger.append({
      invoiceId,
      type: 'giss_reconciliation_query_prepared',
      payload: {
        provider: 'giss',
        operation: 'ConsultarNfsePorRps',
        rps_number: number,
        series,
        request_sha256: prepared.bodySha256,
        request_bytes: prepared.bodyBytes,
        query_data_signed: prepared.queryDataSigned,
        query_signature_profile: prepared.querySignatureProfile,
        fiscal_emission: false,
      },
    });

    let response;
    try {
      response = await this.client.executePreparedRpsQuery('3548500', prepared, material);
    } catch (error) {
      await this.ledger.append({
        invoiceId,
        type: 'giss_reconciliation_query_failed',
        payload: {
          provider: 'giss',
          operation: 'ConsultarNfsePorRps',
          rps_number: number,
          series,
          code: error instanceof FiscalEngineError ? error.code : 'TA_GISS_QUERY_NETWORK_ERROR',
          query_attempted: true,
          fiscal_emission: false,
        },
      });
      throw this.safeGatewayError(error, 'authenticated_query_post', true);
    }

    await this.artifacts.save(invoiceId, 'giss_soap_response', response.body, {
      purpose: 'reconciliation_query',
      operation: 'ConsultarNfsePorRps',
      rps_number: number,
      series,
      http_status: response.status,
      response_sha256: response.bodySha256,
      response_bytes: response.bodyBytes,
      content_type: response.contentType,
      fiscal_emission: false,
    });
    await this.ledger.append({
      invoiceId,
      type: 'giss_reconciliation_query_response',
      payload: {
        provider: 'giss',
        operation: 'ConsultarNfsePorRps',
        rps_number: number,
        series,
        http_status: response.status,
        response_sha256: response.bodySha256,
        response_bytes: response.bodyBytes,
        query_attempted: true,
        fiscal_emission: false,
      },
    });

    let classification;
    try {
      const parsed = parseGissResponse(response.body);
      classification = classifyGissReconciliation(parsed, []);
    } catch (error) {
      await this.ledger.append({
        invoiceId,
        type: 'giss_reconciliation_query_unrecognized',
        payload: {
          provider: 'giss',
          operation: 'ConsultarNfsePorRps',
          rps_number: number,
          series,
          http_status: response.status,
          response_sha256: response.bodySha256,
          query_attempted: true,
          fiscal_emission: false,
        },
      });
      throw this.safeGatewayError(error, 'response_classification', true);
    }

    await this.ledger.append({
      invoiceId,
      type: 'giss_reconciliation_classified',
      payload: {
        provider: 'giss',
        operation: 'ConsultarNfsePorRps',
        rps_number: number,
        series,
        classification,
        verified_not_found_codes: [],
        query_attempted: true,
        fiscal_emission: false,
      },
    });

    // Deliberately safe operational log: no raw SOAP, certificate material or taxpayer data.
    console.log(JSON.stringify({
      event: 'giss_reconciliation_query_result',
      invoice_id: invoiceId,
      rps_number: number,
      series,
      http_status: response.status,
      request_sha256: prepared.bodySha256,
      response_sha256: response.bodySha256,
      query_data_signed: prepared.queryDataSigned,
      query_signature_profile: prepared.querySignatureProfile,
      classification_state: classification.state,
      classification_code: classification.state === 'unknown' ? classification.code : undefined,
      classification_detail_code: classification.state === 'unknown' ? classification.detailCode : undefined,
      fiscal_emission_attempted: false,
    }));

    return {
      environment,
      company_id: companyId,
      invoice_id: invoiceId,
      city_code: '3548500',
      rps_identity: { number, series },
      operation: 'ConsultarNfsePorRps',
      endpoint_host: new URL(prepared.soapAddress).hostname,
      action: prepared.soapAction,
      soap_version: prepared.soapVersion,
      query_data_signed: prepared.queryDataSigned,
      query_signature_profile: prepared.querySignatureProfile,
      request_sha256: prepared.bodySha256,
      request_bytes: prepared.bodyBytes,
      http_status: response.status,
      response_sha256: response.bodySha256,
      response_bytes: response.bodyBytes,
      classification,
      verified_not_found_codes: [],
      query_attempted: true,
      fiscal_transmission_attempted: false,
      fiscal_emission_attempted: false,
      request_body_exposed: false,
      response_body_exposed: false,
      certificate_private_material_exposed: false,
    };
  }

  private async getInvoice(invoiceId: string): Promise<InvoiceRow> {
    const { rows } = await this.db.query<InvoiceRow>('SELECT id, company_id, environment FROM invoices WHERE id=$1', [invoiceId]);
    if (!rows[0]) throw new NotFoundException('Invoice not found');
    return rows[0];
  }

  private safeGatewayError(error: unknown, stage: 'authenticated_query_post' | 'response_classification', queryAttempted: boolean) {
    if (error instanceof FiscalEngineError) {
      return new BadGatewayException({
        stage,
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        query_attempted: queryAttempted,
        fiscal_transmission_attempted: false,
        fiscal_emission_attempted: false,
        response_body_exposed: false,
        certificate_private_material_exposed: false,
      });
    }
    return new BadGatewayException({
      stage,
      code: 'TA_GISS_QUERY_FAILED',
      message: 'GISS reconciliation query failed without exposing raw provider or certificate material.',
      retryable: true,
      query_attempted: queryAttempted,
      fiscal_transmission_attempted: false,
      fiscal_emission_attempted: false,
      response_body_exposed: false,
      certificate_private_material_exposed: false,
    });
  }

  private assertTestEnvironment(environment: FiscalEnvironment) {
    if (environment !== 'test') throw new BadRequestException('Real GISS reconciliation query execution is restricted to the test environment');
  }
}
