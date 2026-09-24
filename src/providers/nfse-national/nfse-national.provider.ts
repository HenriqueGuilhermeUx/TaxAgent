import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CertificateMaterial, CertificateVaultService } from '../../certificates/certificate-vault.service';
import { FiscalDocumentsService } from '../../documents/fiscal-documents.service';
import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';
import { FiscalProvider } from '../../fiscal-core/fiscal-provider.interface';
import { CancelFiscalInput, CanonicalInvoiceInput, EventResult, FiscalContext, FiscalOperationContext, IssueResult } from '../../fiscal-core/fiscal.types';
import { NationalCoverageService } from '../../municipal-parameters/national-coverage.service';
import { PreparedDpsService } from '../../prepared-dps/prepared-dps.service';
import { SchemaRegistryService } from '../../schema-registry/schema-registry.service';
import { TenancyService } from '../../tenancy/tenancy.service';
import { DpsBuilderService, FiscalCompany } from '../../xml-engine/dps-builder.service';
import { EventBuilderService } from '../../xml-engine/event-builder.service';
import { XmlSignatureService } from '../../xml-engine/xml-signature.service';
import { XmlValidationService } from '../../xml-engine/xml-validation.service';
import { classifyNfseRejection } from './nfse-error-classifier';
import { NationalApiResponse, NfseNationalClient } from './nfse-national.client';

@Injectable()
export class NfseNationalProvider implements FiscalProvider {
  readonly name = 'nfse-national';

  constructor(
    private readonly tenancy: TenancyService,
    private readonly vault: CertificateVaultService,
    private readonly schemas: SchemaRegistryService,
    private readonly coverage: NationalCoverageService,
    private readonly builder: DpsBuilderService,
    private readonly eventBuilder: EventBuilderService,
    private readonly validation: XmlValidationService,
    private readonly signature: XmlSignatureService,
    private readonly client: NfseNationalClient,
    private readonly documents: FiscalDocumentsService,
    private readonly preparedDps: PreparedDpsService,
  ) {}

  canHandle(context: FiscalContext): Promise<boolean> {
    return this.coverage.supports(context.issuerCityCode, context.environment, {
      taxRegime: context.taxRegime,
      effectiveAt: context.effectiveAt,
    });
  }

  async issue(input: CanonicalInvoiceInput, operation: FiscalOperationContext): Promise<IssueResult> {
    const mode = process.env.TAXAGENT_NFSE_MODE ?? 'mock';
    if (mode === 'mock') {
      return {
        status: 'authorized',
        provider: this.name,
        accessKey: `MOCK-${randomUUID().replaceAll('-', '').toUpperCase()}`,
        providerReference: `dps_mock_${Date.now()}`,
        raw: {
          mode,
          schema: this.schemas.active(input.environment).id,
          amount: input.service.amount,
          prepared_dps_id: operation.preparedDpsId,
        },
      };
    }

    this.assertLive();
    this.assertDpsConformance(input.environment);
    const company = await this.tenancy.getCompany(input.companyId) as FiscalCompany;
    if (String(company.tax_regime ?? '').toLowerCase() !== 'regular') {
      throw new FiscalEngineError('TA_TAX_REGIME_NOT_LIVE_SUPPORTED', 'TaxAgent live NFS-e builder currently supports company tax_regime=regular only; other regimes remain blocked until their document rules are implemented and homologated', false);
    }
    if (!input.service.nationalServiceCode || !/^\d{6}$/.test(input.service.nationalServiceCode)) {
      throw new FiscalEngineError('TA_NATIONAL_SERVICE_CODE_REQUIRED', 'Live NFS-e transmission requires a 6-digit cTribNac/national_service_code', false);
    }
    if (!input.service.serviceLocationCityCode) {
      throw new FiscalEngineError('TA_SERVICE_LOCATION_REQUIRED', 'Live NFS-e transmission requires service_location_city_code; TaxAgent will not infer it from the customer address', false);
    }
    if (!input.service.issTaxation || !input.service.issWithholding) {
      throw new FiscalEngineError('TA_ISS_FIELDS_REQUIRED', 'Live NFS-e transmission requires iss_taxation (tribISSQN) and iss_withholding (tpRetISSQN)', false);
    }
    const rtcRequiredSince = Date.parse('2026-08-03T00:00:00-03:00');
    if (Date.now() >= rtcRequiredSince && (!input.service.operationIndicator || !input.service.taxSituation || !input.service.taxClassification)) {
      throw new FiscalEngineError('TA_RTC_FIELDS_REQUIRED', 'Live NFS-e transmission requires cIndOp, CST and cClassTrib under the active IBS/CBS rules. Resolve the tax decision before issuance.', false);
    }

    if (operation.preparedDpsId) return this.issuePrepared(input, operation);

    const certificate = await this.vault.getActiveMaterial(input.companyId);
    const existingSigned = await this.documents.latestContent(operation.invoiceId, 'dps-signed-xml');
    if (existingSigned) {
      const metadata = (existingSigned.metadata && typeof existingSigned.metadata === 'object' ? existingSigned.metadata : {}) as { dpsId?: string };
      if (!metadata.dpsId) {
        throw new FiscalEngineError('TA_DPS_IDENTITY_MISSING', 'Stored signed DPS is missing its immutable dpsId metadata; refusing to construct a second DPS', false);
      }
      const reconciled = await this.client.findByDpsId(input.environment, metadata.dpsId, certificate);
      if (reconciled) return this.authorizedFromReconciliation(operation.invoiceId, metadata.dpsId, reconciled, input.environment, certificate);
      return this.transmitSigned(operation.invoiceId, metadata.dpsId, existingSigned.content.toString('utf8'), input.environment, certificate);
    }

    const built = await this.builder.build(input, company);
    await this.validation.validateWellFormed(built.xml);
    await this.validation.validateStrict(built.xml, input.environment);
    const signedXml = this.signature.sign(built.xml, built.id, 'infDPS', certificate);
    await this.validation.validateWellFormed(signedXml);
    await this.validation.validateStrict(signedXml, input.environment);
    await this.documents.save({
      invoiceId: operation.invoiceId,
      kind: 'dps-signed-xml',
      content: signedXml,
      contentType: 'application/xml',
      metadata: {
        dpsId: built.id,
        sequence: built.sequence,
        series: built.series,
        issuedAt: input.issuedAt,
        competence: input.competence,
        schema: this.schemas.active(input.environment).id,
      },
    });
    return this.transmitSigned(operation.invoiceId, built.id, signedXml, input.environment, certificate);
  }

  async cancel(input: CancelFiscalInput, operation: FiscalOperationContext): Promise<EventResult> {
    const mode = process.env.TAXAGENT_NFSE_MODE ?? 'mock';
    if (mode === 'mock') {
      return { status: 'registered', provider: this.name, providerReference: `evt_mock_${Date.now()}`, raw: { mode, event: 'e101101' } };
    }

    this.assertLive();
    const company = await this.tenancy.getCompany(input.companyId) as FiscalCompany;
    const built = this.eventBuilder.buildCancellation(input, company);
    if (!built.verifiedLayout) {
      const conformance = this.schemas.eventConformance(input.environment);
      throw new FiscalEngineError(
        'TA_EVENT_BUILDER_UNVERIFIED',
        `Event builder conformance is not verified for active schema ${this.schemas.active(input.environment).id}: ${conformance.reason}`,
        false,
        { environment: input.environment, schema_id: this.schemas.active(input.environment).id, conformance_verified: false },
      );
    }

    await this.validation.validateWellFormed(built.xml);
    await this.validation.validateEventStrict(built.xml, input.environment);
    const certificate = await this.vault.getActiveMaterial(input.companyId);

    // Cancellation event 101101 uses the first provider sequence for the first cancellation event.
    // Every attempt reconciles this exact event before any POST so a lost HTTP response cannot trigger a blind duplicate.
    const reconciled = await this.client.findEventByTypeAndSequence(input.environment, input.accessKey, '101101', 1, certificate);
    if (reconciled) {
      if (this.hasRejection(reconciled)) {
        throw new FiscalEngineError(
          'NFSE_EVENT_RECONCILIATION_INCOMPLETE',
          'SEFIN event reconciliation returned a structured error instead of a definitive registered cancellation event; no event was retransmitted',
          true,
          this.client.sanitize(reconciled),
        );
      }
      const reconciledEventXml = this.client.decodeEventXml(reconciled);
      if (!reconciledEventXml) {
        throw new FiscalEngineError(
          'NFSE_EVENT_RECONCILIATION_INCOMPLETE',
          'SEFIN event reconciliation returned HTTP success without eventoXmlGZipB64; no event was retransmitted while provider state is incomplete',
          true,
          this.client.sanitize(reconciled),
        );
      }
      await this.documents.save({
        invoiceId: operation.invoiceId,
        kind: 'cancellation-event-xml',
        content: reconciledEventXml,
        contentType: 'application/xml',
        metadata: { accessKey: input.accessKey, eventType: '101101', eventSequence: 1, reconciled: true },
      });
      return { status: 'registered', provider: this.name, providerReference: built.id, raw: this.client.sanitize(reconciled) };
    }

    const existingRequest = await this.documents.latestContent(operation.invoiceId, 'cancellation-request-xml');
    if (existingRequest) {
      const rejectionEvidence = await this.documents.latestContent(operation.invoiceId, 'cancellation-rejection-json');
      const rejectionMetadata = (rejectionEvidence?.metadata && typeof rejectionEvidence.metadata === 'object'
        ? rejectionEvidence.metadata
        : {}) as { requestDocumentId?: string };
      const previousRequestWasDefinitivelyRejected = rejectionMetadata.requestDocumentId === existingRequest.id;
      if (!previousRequestWasDefinitivelyRejected) {
        throw new FiscalEngineError(
          'TA_NFSE_EVENT_RECONCILIATION_PENDING',
          'A signed cancellation request was already persisted and SEFIN does not currently return the cancellation event. TaxAgent will keep reconciling and will not POST the event again blindly.',
          true,
          {
            event_id: built.id,
            event_type: '101101',
            event_sequence: 1,
            request_sha256: existingRequest.sha256,
            fiscal_transmission_attempted_previously: true,
            fiscal_retransmission_attempted: false,
          },
        );
      }
    }

    const signedXml = this.signature.sign(built.xml, built.id, 'infPedReg', certificate);
    await this.validation.validateWellFormed(signedXml);
    await this.validation.validateEventStrict(signedXml, input.environment);
    const requestDocument = await this.documents.save({
      invoiceId: operation.invoiceId,
      kind: 'cancellation-request-xml',
      content: signedXml,
      contentType: 'application/xml',
      metadata: {
        eventId: built.id,
        eventType: '101101',
        eventSequence: 1,
        accessKey: input.accessKey,
        schema: this.schemas.active(input.environment).id,
      },
    });

    const response = await this.client.registerEvent(input.environment, input.accessKey, signedXml, certificate);
    if (this.hasRejection(response)) {
      const rejected = this.eventRejection(response, built.id);
      await this.documents.save({
        invoiceId: operation.invoiceId,
        kind: 'cancellation-rejection-json',
        content: JSON.stringify(this.client.sanitize(response)),
        contentType: 'application/json',
        metadata: { requestDocumentId: requestDocument.id, eventId: built.id, accessKey: input.accessKey },
      });
      return rejected;
    }

    const eventXml = this.client.decodeEventXml(response);
    if (!eventXml) {
      throw new FiscalEngineError(
        'NFSE_EVENT_RESPONSE_INCOMPLETE',
        'SEFIN accepted the cancellation request transport but returned no eventoXmlGZipB64. TaxAgent will reconcile provider state before any further action.',
        true,
        {
          event_id: built.id,
          request_sha256: requestDocument.sha256,
          fiscal_retransmission_attempted: false,
          response: this.client.sanitize(response),
        },
      );
    }

    await this.documents.save({
      invoiceId: operation.invoiceId,
      kind: 'cancellation-event-xml',
      content: eventXml,
      contentType: 'application/xml',
      metadata: { accessKey: input.accessKey, eventType: '101101', eventSequence: 1, reconciled: false },
    });
    return { status: 'registered', provider: this.name, providerReference: built.id, raw: this.client.sanitize(response) };
  }

  private async issuePrepared(input: CanonicalInvoiceInput, operation: FiscalOperationContext): Promise<IssueResult> {
    this.assertDpsConformance(input.environment);
    const preparedId = operation.preparedDpsId!;
    const record = await this.preparedDps.get(preparedId, input.companyId);
    if (record.environment !== input.environment) {
      throw new FiscalEngineError('TA_PREPARED_DPS_ENVIRONMENT_MISMATCH', 'Prepared DPS environment does not match invoice environment', false);
    }
    if (record.schema_id !== this.schemas.active(input.environment).id) {
      throw new FiscalEngineError('TA_PREPARED_DPS_SCHEMA_STALE', `Prepared DPS schema ${record.schema_id} is not the active ${this.schemas.active(input.environment).id}`, false);
    }

    await this.preparedDps.sign(preparedId, input.companyId);
    const material = await this.preparedDps.signedMaterial(preparedId, input.companyId);
    const certificate = await this.vault.getActiveMaterial(input.companyId);
    const existingDocument = await this.documents.latestContent(operation.invoiceId, 'dps-signed-xml');
    if (existingDocument) {
      if (existingDocument.sha256 !== material.record.signed_xml_sha256) {
        throw new FiscalEngineError('TA_PREPARED_DPS_DOCUMENT_MISMATCH', 'Invoice already contains a different signed DPS; refusing to transmit', false);
      }
    } else {
      await this.documents.save({
        invoiceId: operation.invoiceId,
        kind: 'dps-signed-xml',
        content: material.signedXml,
        contentType: 'application/xml',
        metadata: {
          preparedDpsId: record.id,
          dpsId: record.dps_id,
          sequence: Number(record.sequence),
          series: record.series,
          issuedAt: record.issued_at,
          competence: String(record.competence).slice(0, 10),
          schema: record.schema_id,
          unsignedXmlSha256: record.unsigned_xml_sha256,
        },
      });
    }

    const reconciled = await this.client.findByDpsId(input.environment, record.dps_id, certificate);
    if (reconciled) return this.authorizedFromReconciliation(operation.invoiceId, record.dps_id, reconciled, input.environment, certificate);
    return this.transmitSigned(operation.invoiceId, record.dps_id, material.signedXml, input.environment, certificate);
  }

  private async transmitSigned(
    invoiceId: string,
    dpsId: string,
    signedXml: string,
    environment: CanonicalInvoiceInput['environment'],
    certificate: CertificateMaterial,
  ): Promise<IssueResult> {
    const response = await this.client.issue(environment, signedXml, certificate);
    return this.authorizedResponse(invoiceId, dpsId, response);
  }

  private async authorizedFromReconciliation(
    invoiceId: string,
    dpsId: string,
    response: NationalApiResponse,
    environment: CanonicalInvoiceInput['environment'],
    certificate: CertificateMaterial,
  ): Promise<IssueResult> {
    if (this.hasRejection(response)) return this.rejection(response, dpsId);
    const accessKey = typeof response.chaveAcesso === 'string' ? response.chaveAcesso : undefined;
    if (!accessKey) {
      throw new FiscalEngineError('NFSE_RECONCILIATION_INCOMPLETE', `SEFIN returned a DPS reconciliation response without chaveAcesso for ${dpsId}; refusing to retransmit until state is known`, true, this.client.sanitize(response));
    }
    const full = await this.client.getByAccessKey(environment, accessKey, certificate);
    return this.authorizedResponse(invoiceId, dpsId, full, accessKey);
  }

  private async authorizedResponse(invoiceId: string, dpsId: string, response: NationalApiResponse, fallbackAccessKey?: string): Promise<IssueResult> {
    if (this.hasRejection(response)) return this.rejection(response, response.idDps ?? response.idDPS ?? dpsId);
    const accessKey = response.chaveAcesso ?? fallbackAccessKey;
    if (!accessKey) {
      throw new FiscalEngineError('NFSE_RESPONSE_INCOMPLETE', `SEFIN response does not contain chaveAcesso for ${dpsId}`, true, this.client.sanitize(response));
    }
    const providerReference = response.idDps ?? response.idDPS ?? dpsId;
    const authorizedXml = this.client.decodeNfseXml(response);
    if (authorizedXml) {
      await this.documents.save({
        invoiceId,
        kind: 'nfse-authorized-xml',
        content: authorizedXml,
        contentType: 'application/xml',
        metadata: { accessKey, providerReference },
      });
    }
    return { status: 'authorized', provider: this.name, accessKey, providerReference, raw: this.client.sanitize(response) };
  }

  private assertLive() {
    if (process.env.TAXAGENT_LIVE_ENABLED !== 'true') {
      throw new FiscalEngineError('TA_LIVE_DISABLED', 'Live transmission blocked: TAXAGENT_LIVE_ENABLED must be true', false);
    }
  }

  private assertDpsConformance(environment: CanonicalInvoiceInput['environment']) {
    const conformance = this.schemas.dpsConformance(environment);
    if (!conformance.verified) {
      throw new FiscalEngineError(
        'TA_DPS_BUILDER_UNVERIFIED',
        `DPS builder conformance is not verified for active schema ${this.schemas.active(environment).id}: ${conformance.reason}`,
        false,
        { environment, schema_id: this.schemas.active(environment).id, conformance_verified: false },
      );
    }
  }

  private hasRejection(response: NationalApiResponse): boolean {
    return this.responseErrors(response).length > 0;
  }

  private responseErrors(response: NationalApiResponse): Array<{ code?: string; description?: string; complement?: string }> {
    const list = (response.erros ?? []).map((item) => ({
      code: item.Codigo,
      description: item.Descricao,
      complement: item.Complemento,
    }));
    if (response.erro) {
      list.push({
        code: response.erro.codigo,
        description: response.erro.descricao ?? response.erro.mensagem,
        complement: response.erro.complemento,
      });
    }
    return list;
  }

  private eventRejection(response: NationalApiResponse, providerReference?: string): EventResult {
    const first = this.responseErrors(response)[0] ?? {};
    const classified = classifyNfseRejection(first.code);
    return {
      status: 'rejected',
      provider: this.name,
      providerReference,
      raw: this.client.sanitize(response),
      rejection: {
        code: first.code ?? 'NFSE_EVENT_REJECTED',
        message: [first.description, first.complement].filter(Boolean).join(' - ') || 'NFS-e event rejected',
        retryable: classified.retryable,
        category: classified.category,
      },
    };
  }

  private rejection(response: NationalApiResponse, providerReference?: string): IssueResult {
    const first = this.responseErrors(response)[0] ?? {};
    const classified = classifyNfseRejection(first.code);
    return {
      status: 'rejected',
      provider: this.name,
      providerReference,
      raw: this.client.sanitize(response),
      rejection: {
        code: first.code ?? 'NFSE_REJECTED',
        message: [first.description, first.complement].filter(Boolean).join(' - ') || 'NFS-e rejected',
        retryable: classified.retryable,
        category: classified.category,
      },
    };
  }
}
