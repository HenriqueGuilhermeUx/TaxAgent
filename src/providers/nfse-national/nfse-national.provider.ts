import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CertificateVaultService } from '../../certificates/certificate-vault.service';
import { FiscalProvider } from '../../fiscal-core/fiscal-provider.interface';
import { CanonicalInvoiceInput, FiscalContext, IssueResult } from '../../fiscal-core/fiscal.types';
import { SchemaRegistryService } from '../../schema-registry/schema-registry.service';
import { TenancyService } from '../../tenancy/tenancy.service';
import { DpsBuilderService, FiscalCompany } from '../../xml-engine/dps-builder.service';
import { XmlSignatureService } from '../../xml-engine/xml-signature.service';
import { XmlValidationService } from '../../xml-engine/xml-validation.service';
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
  ) {}

  async canHandle(_context: FiscalContext): Promise<boolean> {
    return true;
  }

  async issue(input: CanonicalInvoiceInput): Promise<IssueResult> {
    const mode = process.env.TAXAGENT_NFSE_MODE ?? 'mock';
    if (mode === 'mock') {
      return {
        status: 'authorized',
        provider: this.name,
        accessKey: `MOCK-${randomUUID().replaceAll('-', '').toUpperCase()}`,
        providerReference: `dps_mock_${Date.now()}`,
        raw: { mode, schema: this.schemas.active(input.environment).id, amount: input.service.amount },
      };
    }

    if (process.env.TAXAGENT_LIVE_ENABLED !== 'true') throw new Error('Live transmission blocked: TAXAGENT_LIVE_ENABLED must be true');
    const companyRow = await this.tenancy.getCompany(input.companyId) as FiscalCompany;
    const built = await this.builder.build(input, companyRow);
    if (!built.verifiedLayout) throw new Error('Live transmission blocked: DPS builder has not been marked verified against the active official schema');
    await this.validation.validateWellFormed(built.xml);
    await this.validation.assertStrictSchemaAvailable();

    const certificate = await this.vault.getActiveMaterial(input.companyId);
    const signedXml = this.signature.sign(built.xml, built.id, certificate);
    await this.validation.validateWellFormed(signedXml);
    const response = await this.client.issue(input.environment, signedXml, certificate);

    if (response.erros?.length) {
      const first = response.erros[0];
      return {
        status: 'rejected',
        provider: this.name,
        providerReference: response.idDps,
        raw: response,
        rejection: {
          code: first.Codigo ?? 'NFSE_REJECTED',
          message: [first.Descricao, first.Complemento].filter(Boolean).join(' - ') || 'NFS-e rejected',
          retryable: false,
        },
      };
    }

    return {
      status: 'authorized',
      provider: this.name,
      accessKey: response.chaveAcesso,
      providerReference: response.idDps,
      raw: response,
    };
  }
}
