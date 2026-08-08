import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CertificateVaultService } from '../../certificates/certificate-vault.service';
import { FiscalDocumentsService } from '../../documents/fiscal-documents.service';
import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';
import { FiscalProvider } from '../../fiscal-core/fiscal-provider.interface';
import { CanonicalInvoiceInput, FiscalContext, FiscalOperationContext, IssueResult } from '../../fiscal-core/fiscal.types';
import { SchemaRegistryService } from '../../schema-registry/schema-registry.service';
import { TenancyService } from '../../tenancy/tenancy.service';
import { DpsBuilderService, FiscalCompany } from '../../xml-engine/dps-builder.service';
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
    private readonly builder: DpsBuilderService,
    private readonly validation: XmlValidationService,
    private readonly signature: XmlSignatureService,
    private readonly client: NfseNationalClient,
    private readonly documents: FiscalDocumentsService,
  ) {}

  async canHandle(_context: FiscalContext): Promise<boolean> {
    return true;
  }

  async issue(input: CanonicalInvoiceInput, operation: FiscalOperationContext): Promise<IssueResult> {
    const mode = process.env.TAXAGENT_NFSE_MODE ?? 'mock';
    if (mode === 'mock') {
      return {
        status: 'authorized', provider: this.name,
        accessKey: `MOCK-${randomUUID().replaceAll('-', '').toUpperCase()}`,
        providerReference: `dps_mock_${Date.now()}`,
        raw: { mode, schema: this.schemas.active(input.environment).id, amount: input.service.amount },
      };
    }

    if (process.env.TAXAGENT_LIVE_ENABLED !== 'true') throw new FiscalEngineError('TA_LIVE_DISABLED', 'Live transmission blocked: TAXAGENT_LIVE_ENABLED must be true', false);
    const companyRow = await this.tenancy.getCompany(input.companyId) as FiscalCompany;
    const built = await this.builder.build(input, companyRow);
    if (!built.verifiedLayout) throw new FiscalEngineError('TA_DPS_BUILDER_UNVERIFIED', 'Live transmission blocked: DPS builder is not marked verified against the active official schema', false);
    await this.validation.validateWellFormed(built.xml);
    await this.validation.validateStrict(built.xml, input.environment);

    const certificate = await this.vault.getActiveMaterial(input.companyId);
    const signedXml = this.signature.sign(built.xml, built.id, certificate);
    await this.validation.validateWellFormed(signedXml);
    await this.validation.validateStrict(signedXml, input.environment);
    await this.documents.save({ invoiceId: operation.invoiceId, kind: 'dps-signed-xml', content: signedXml, contentType: 'application/xml', metadata: { dpsId: built.id, schema: this.schemas.active(input.environment).id } });

    const response = await this.client.issue(input.environment, signedXml, certificate);
    const providerReference = response.idDps ?? response.idDPS;
    if (response.erros?.length) {
      const first = response.erros[0];
      const classified = classifyNfseRejection(first.Codigo);
      return {
        status: 'rejected', provider: this.name, providerReference, raw: this.client.sanitize(response),
        rejection: {
          code: first.Codigo ?? 'NFSE_REJECTED',
          message: [first.Descricao, first.Complemento].filter(Boolean).join(' - ') || 'NFS-e rejected',
          retryable: classified.retryable,
          category: classified.category,
        },
      };
    }

    const authorizedXml = this.client.decodeNfseXml(response);
    if (authorizedXml) {
      await this.documents.save({ invoiceId: operation.invoiceId, kind: 'nfse-authorized-xml', content: authorizedXml, contentType: 'application/xml', metadata: { accessKey: response.chaveAcesso, providerReference } });
    }
    return { status: 'authorized', provider: this.name, accessKey: response.chaveAcesso, providerReference, raw: this.client.sanitize(response) };
  }
}
