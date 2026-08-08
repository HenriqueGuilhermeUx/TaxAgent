import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CertificateVaultService } from '../../certificates/certificate-vault.service';
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
import { NfseNationalClient } from './nfse-national.client';

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
  ) {}
  canHandle(context: FiscalContext): Promise<boolean> { return this.coverage.supports(context.issuerCityCode, context.environment); }
  async issue(input: CanonicalInvoiceInput, operation: FiscalOperationContext): Promise<IssueResult> {
    const mode = process.env.TAXAGENT_NFSE_MODE ?? 'mock';
    if (mode === 'mock') return { status: 'authorized', provider: this.name, accessKey: `MOCK-${randomUUID().replaceAll('-', '').toUpperCase()}`, providerReference: `dps_mock_${Date.now()}`, raw: { mode, schema: this.schemas.active(input.environment).id, amount: input.service.amount } };
    this.assertLive();
    const company = await this.tenancy.getCompany(input.companyId) as FiscalCompany;
    const built = await this.builder.build(input, company);
    if (!built.verifiedLayout) throw new FiscalEngineError('TA_DPS_BUILDER_UNVERIFIED', 'DPS builder is not marked verified against the active official schema', false);
    await this.validation.validateWellFormed(built.xml);
    await this.validation.validateStrict(built.xml, input.environment);
    const certificate = await this.vault.getActiveMaterial(input.companyId);
    const signedXml = this.signature.sign(built.xml, built.id, 'infDPS', certificate);
    await this.validation.validateWellFormed(signedXml);
    await this.validation.validateStrict(signedXml, input.environment);
    await this.documents.save({ invoiceId: operation.invoiceId, kind: 'dps-signed-xml', content: signedXml, contentType: 'application/xml', metadata: { dpsId: built.id, schema: this.schemas.active(input.environment).id } });
    const response = await this.client.issue(input.environment, signedXml, certificate);
    const providerReference = response.idDps ?? response.idDPS;
    if (response.erros?.length) return this.rejection(response, providerReference);
    const authorizedXml = this.client.decodeNfseXml(response);
    if (authorizedXml) await this.documents.save({ invoiceId: operation.invoiceId, kind: 'nfse-authorized-xml', content: authorizedXml, contentType: 'application/xml', metadata: { accessKey: response.chaveAcesso, providerReference } });
    return { status: 'authorized', provider: this.name, accessKey: response.chaveAcesso, providerReference, raw: this.client.sanitize(response) };
  }
  async cancel(input: CancelFiscalInput, operation: FiscalOperationContext): Promise<EventResult> {
    const mode = process.env.TAXAGENT_NFSE_MODE ?? 'mock';
    if (mode === 'mock') return { status: 'registered', provider: this.name, providerReference: `evt_mock_${Date.now()}`, raw: { mode, event: 'e101101' } };
    this.assertLive();
    const company = await this.tenancy.getCompany(input.companyId) as FiscalCompany;
    const built = this.eventBuilder.buildCancellation(input, company);
    if (!built.verifiedLayout) throw new FiscalEngineError('TA_EVENT_BUILDER_UNVERIFIED', 'Event builder is not marked verified against the active official schema', false);
    await this.validation.validateWellFormed(built.xml);
    await this.validation.validateEventStrict(built.xml, input.environment);
    const certificate = await this.vault.getActiveMaterial(input.companyId);
    const signedXml = this.signature.sign(built.xml, built.id, 'infPedReg', certificate);
    await this.validation.validateWellFormed(signedXml);
    await this.validation.validateEventStrict(signedXml, input.environment);
    await this.documents.save({ invoiceId: operation.invoiceId, kind: 'cancellation-request-xml', content: signedXml, contentType: 'application/xml', metadata: { eventId: built.id, accessKey: input.accessKey } });
    const response = await this.client.registerEvent(input.environment, input.accessKey, signedXml, certificate);
    if (response.erros?.length) {
      const rejected = this.rejection(response);
      return { status: 'rejected', provider: rejected.provider, providerReference: rejected.providerReference, raw: rejected.raw, rejection: rejected.rejection };
    }
    const eventXml = this.client.decodeEventXml(response);
    if (eventXml) await this.documents.save({ invoiceId: operation.invoiceId, kind: 'cancellation-event-xml', content: eventXml, contentType: 'application/xml', metadata: { accessKey: input.accessKey } });
    return { status: 'registered', provider: this.name, raw: this.client.sanitize(response) };
  }
  private assertLive() { if (process.env.TAXAGENT_LIVE_ENABLED !== 'true') throw new FiscalEngineError('TA_LIVE_DISABLED', 'Live transmission blocked: TAXAGENT_LIVE_ENABLED must be true', false); }
  private rejection(response: any, providerReference?: string): IssueResult {
    const first = response.erros[0];
    const classified = classifyNfseRejection(first.Codigo);
    return { status: 'rejected', provider: this.name, providerReference, raw: this.client.sanitize(response), rejection: { code: first.Codigo ?? 'NFSE_REJECTED', message: [first.Descricao, first.Complemento].filter(Boolean).join(' - ') || 'NFS-e rejected', retryable: classified.retryable, category: classified.category } };
  }
}
