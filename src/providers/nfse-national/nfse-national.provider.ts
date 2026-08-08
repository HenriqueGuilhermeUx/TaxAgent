import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CertificateMaterial, CertificateVaultService } from '../../certificates/certificate-vault.service';
import { FiscalDocumentsService } from '../../documents/fiscal-documents.service';
import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';
import { FiscalProvider } from '../../fiscal-core/fiscal-provider.interface';
import { CancelFiscalInput, CanonicalInvoiceInput, EventResult, FiscalContext, FiscalOperationContext, IssueResult } from '../../fiscal-core/fiscal.types';
import { NationalCoverageService } from '../../municipal-parameters/national-coverage.service';
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
  constructor(private readonly tenancy: TenancyService, private readonly vault: CertificateVaultService, private readonly schemas: SchemaRegistryService, private readonly coverage: NationalCoverageService, private readonly builder: DpsBuilderService, private readonly eventBuilder: EventBuilderService, private readonly validation: XmlValidationService, private readonly signature: XmlSignatureService, private readonly client: NfseNationalClient, private readonly documents: FiscalDocumentsService) {}
  canHandle(context: FiscalContext): Promise<boolean> { return this.coverage.supports(context.issuerCityCode, context.environment); }
  async issue(input: CanonicalInvoiceInput, operation: FiscalOperationContext): Promise<IssueResult> {
    const mode = process.env.TAXAGENT_NFSE_MODE ?? 'mock';
    if (mode === 'mock') return { status: 'authorized', provider: this.name, accessKey: `MOCK-${randomUUID().replaceAll('-', '').toUpperCase()}`, providerReference: `dps_mock_${Date.now()}`, raw: { mode, schema: this.schemas.active(input.environment).id, amount: input.service.amount } };
    this.assertLive();
    const company = await this.tenancy.getCompany(input.companyId) as FiscalCompany;
    if (String(company.tax_regime ?? '').toLowerCase() !== 'regular') throw new FiscalEngineError('TA_TAX_REGIME_NOT_LIVE_SUPPORTED', 'TaxAgent live NFS-e builder currently supports company tax_regime=regular only; other regimes remain blocked until their document rules are implemented and homologated', false);
    if (!input.service.nationalServiceCode || !/^\d{6}$/.test(input.service.nationalServiceCode)) throw new FiscalEngineError('TA_NATIONAL_SERVICE_CODE_REQUIRED', 'Live NFS-e transmission requires a 6-digit cTribNac/national_service_code', false);
    if (!input.service.serviceLocationCityCode) throw new FiscalEngineError('TA_SERVICE_LOCATION_REQUIRED', 'Live NFS-e transmission requires service_location_city_code; TaxAgent will not infer it from the customer address', false);
    if (!input.service.issTaxation || !input.service.issWithholding) throw new FiscalEngineError('TA_ISS_FIELDS_REQUIRED', 'Live NFS-e transmission requires iss_taxation (tribISSQN) and iss_withholding (tpRetISSQN)', false);
    const rtcRequiredSince = Date.parse('2026-08-03T00:00:00-03:00');
    if (Date.now() >= rtcRequiredSince && (!input.service.operationIndicator || !input.service.taxSituation || !input.service.taxClassification)) throw new FiscalEngineError('TA_RTC_FIELDS_REQUIRED', 'Live NFS-e transmission requires cIndOp, CST and cClassTrib under the active IBS/CBS rules. Resolve the tax decision before issuance.', false);
    const certificate = await this.vault.getActiveMaterial(input.companyId);
    const existingSigned = await this.documents.latestContent(operation.invoiceId, 'dps-signed-xml');
    if (existingSigned) {
      const metadata = (existingSigned.metadata && typeof existingSigned.metadata === 'object' ? existingSigned.metadata : {}) as { dpsId?: string };
      if (!metadata.dpsId) throw new FiscalEngineError('TA_DPS_IDENTITY_MISSING', 'Stored signed DPS is missing its immutable dpsId metadata; refusing to construct a second DPS', false);
      const reconciled = await this.client.findByDpsId(input.environment, metadata.dpsId, certificate);
      if (reconciled) return this.authorizedFromReconciliation(operation.invoiceId, metadata.dpsId, reconciled, input.environment, certificate);
      return this.transmitSigned(operation.invoiceId, metadata.dpsId, existingSigned.content.toString('utf8'), input.environment, certificate);
    }
    const built = await this.builder.build(input, company);
    if (!built.verifiedLayout) throw new FiscalEngineError('TA_DPS_BUILDER_UNVERIFIED', 'DPS builder is not marked verified against the active official schema', false);
    await this.validation.validateWellFormed(built.xml); await this.validation.validateStrict(built.xml, input.environment);
    const signedXml = this.signature.sign(built.xml, built.id, 'infDPS', certificate);
    await this.validation.validateWellFormed(signedXml); await this.validation.validateStrict(signedXml, input.environment);
    await this.documents.save({ invoiceId: operation.invoiceId, kind: 'dps-signed-xml', content: signedXml, contentType: 'application/xml', metadata: { dpsId: built.id, sequence: built.sequence, series: built.series, issuedAt: input.issuedAt, competence: input.competence, schema: this.schemas.active(input.environment).id } });
    return this.transmitSigned(operation.invoiceId, built.id, signedXml, input.environment, certificate);
  }
  async cancel(input: CancelFiscalInput, operation: FiscalOperationContext): Promise<EventResult> {
    const mode = process.env.TAXAGENT_NFSE_MODE ?? 'mock'; if (mode === 'mock') return { status: 'registered', provider: this.name, providerReference: `evt_mock_${Date.now()}`, raw: { mode, event: 'e101101' } };
    this.assertLive(); const company = await this.tenancy.getCompany(input.companyId) as FiscalCompany; const built = this.eventBuilder.buildCancellation(input, company); if (!built.verifiedLayout) throw new FiscalEngineError('TA_EVENT_BUILDER_UNVERIFIED', 'Event builder is not marked verified against the active official schema', false); await this.validation.validateWellFormed(built.xml); await this.validation.validateEventStrict(built.xml, input.environment); const certificate = await this.vault.getActiveMaterial(input.companyId); const signedXml = this.signature.sign(built.xml, built.id, 'infPedReg', certificate); await this.validation.validateWellFormed(signedXml); await this.validation.validateEventStrict(signedXml, input.environment); await this.documents.save({ invoiceId: operation.invoiceId, kind: 'cancellation-request-xml', content: signedXml, contentType: 'application/xml', metadata: { eventId: built.id, accessKey: input.accessKey } }); const response = await this.client.registerEvent(input.environment, input.accessKey, signedXml, certificate); if (response.erros?.length) { const rejected = this.rejection(response); return { status: 'rejected', provider: rejected.provider, providerReference: rejected.providerReference, raw: rejected.raw, rejection: rejected.rejection }; } const eventXml = this.client.decodeEventXml(response); if (eventXml) await this.documents.save({ invoiceId: operation.invoiceId, kind: 'cancellation-event-xml', content: eventXml, contentType: 'application/xml', metadata: { accessKey: input.accessKey } }); return { status: 'registered', provider: this.name, raw: this.client.sanitize(response) };
  }
  private async transmitSigned(invoiceId: string, dpsId: string, signedXml: string, environment: CanonicalInvoiceInput['environment'], certificate: CertificateMaterial): Promise<IssueResult> { const response = await this.client.issue(environment, signedXml, certificate); return this.authorizedResponse(invoiceId, dpsId, response); }
  private async authorizedFromReconciliation(invoiceId: string, dpsId: string, response: NationalApiResponse, environment: CanonicalInvoiceInput['environment'], certificate: CertificateMaterial): Promise<IssueResult> {
    if (response.erros?.length) return this.rejection(response, dpsId);
    const accessKey = typeof response.chaveAcesso === 'string' ? response.chaveAcesso : undefined;
    if (!accessKey) throw new FiscalEngineError('NFSE_RECONCILIATION_INCOMPLETE', `SEFIN returned a DPS reconciliation response without chaveAcesso for ${dpsId}; refusing to retransmit until state is known`, true, this.client.sanitize(response));
    const full = await this.client.getByAccessKey(environment, accessKey, certificate);
    return this.authorizedResponse(invoiceId, dpsId, full, accessKey);
  }
  private async authorizedResponse(invoiceId: string, dpsId: string, response: NationalApiResponse, fallbackAccessKey?: string): Promise<IssueResult> {
    if (response.erros?.length) return this.rejection(response, response.idDps ?? response.idDPS ?? dpsId);
    const accessKey = response.chaveAcesso ?? fallbackAccessKey;
    if (!accessKey) throw new FiscalEngineError('NFSE_RESPONSE_INCOMPLETE', `SEFIN response does not contain chaveAcesso for ${dpsId}`, true, this.client.sanitize(response));
    const providerReference = response.idDps ?? response.idDPS ?? dpsId;
    const authorizedXml = this.client.decodeNfseXml(response);
    if (authorizedXml) await this.documents.save({ invoiceId, kind: 'nfse-authorized-xml', content: authorizedXml, contentType: 'application/xml', metadata: { accessKey, providerReference } });
    return { status: 'authorized', provider: this.name, accessKey, providerReference, raw: this.client.sanitize(response) };
  }
  private assertLive() { if (process.env.TAXAGENT_LIVE_ENABLED !== 'true') throw new FiscalEngineError('TA_LIVE_DISABLED', 'Live transmission blocked: TAXAGENT_LIVE_ENABLED must be true', false); }
  private rejection(response: any, providerReference?: string): IssueResult { const first = response.erros[0]; const classified = classifyNfseRejection(first.Codigo); return { status: 'rejected', provider: this.name, providerReference, raw: this.client.sanitize(response), rejection: { code: first.Codigo ?? 'NFSE_REJECTED', message: [first.Descricao, first.Complemento].filter(Boolean).join(' - ') || 'NFS-e rejected', retryable: classified.retryable, category: classified.category } }; }
}
