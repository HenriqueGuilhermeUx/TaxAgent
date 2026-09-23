import { Injectable } from '@nestjs/common';
import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';
import { FiscalProvider } from '../../fiscal-core/fiscal-provider.interface';
import { gissEndpointPolicy } from './giss-endpoints';
import { GissClient } from './giss.client';
import { GissReconciliationService } from './giss-reconciliation.service';
import { GissArtifactsService } from './giss-artifacts.service';
import { GissSignatureService } from './giss-signature.service';
import { buildAbrasfRps } from './abrasf-rps.builder';
import { buildAbrasfLoteRps } from './giss-batch.builder';
import { TenancyService } from '../../tenancy/tenancy.service';
import { CertificateVaultService } from '../../certificates/certificate-vault.service';
import { CancelFiscalInput, CanonicalInvoiceInput, EventResult, FiscalContext, FiscalOperationContext, IssueResult } from '../../fiscal-core/fiscal.types';

@Injectable()
export class GissProvider implements FiscalProvider {
  readonly name = 'giss';
  constructor(private readonly client: GissClient, private readonly reconciliation: GissReconciliationService, private readonly artifacts: GissArtifactsService, private readonly signatures: GissSignatureService, private readonly tenancy: TenancyService, private readonly vault: CertificateVaultService) {}

  async canHandle(context: FiscalContext): Promise<boolean> {
    return context.issuerCityCode === '3548500';
  }

  async issue(input: CanonicalInvoiceInput, operation: FiscalOperationContext): Promise<IssueResult> {
    const company = await this.tenancy.getCompany(input.companyId) as { tax_id: string; municipal_registration?: string | null };
    if (!input.customer.address) throw new FiscalEngineError('TA_GISS_CUSTOMER_ADDRESS_REQUIRED', 'Current GISS layout requires the domestic customer address before RPS assembly.', false, { transmission_attempted: false });
    if (!input.service.nbsCode) throw new FiscalEngineError('TA_GISS_NBS_REQUIRED', 'Current GISS layout requires CodigoNbs before RPS assembly.', false, { transmission_attempted: false });
    if (!input.service.nationalServiceCode) throw new FiscalEngineError('TA_GISS_SERVICE_ITEM_REQUIRED', 'GISS requires an LC 116 service item derived from the classified national service code.', false, { transmission_attempted: false });
    if (!input.service.issWithholding) throw new FiscalEngineError('TA_GISS_ISS_WITHHOLDING_REQUIRED', 'GISS requires an explicit ISS withholding decision.', false, { transmission_attempted: false });
    if (input.service.issTaxation !== '1') throw new FiscalEngineError('TA_GISS_ISS_MAPPING_REQUIRED', 'Only the verified taxable ISS mapping is enabled for the current GISS adapter.', false, { iss_taxation: input.service.issTaxation, transmission_attempted: false });

    const rpsNumber = operation.invoiceId.replace(/\D/g, '').slice(-12) || '1';
    const rps = buildAbrasfRps({
      number: rpsNumber,
      series: 'TA',
      issuedAt: input.issuedAt ?? new Date().toISOString(),
      providerTaxId: company.tax_id,
      municipalRegistration: company.municipal_registration,
      customerTaxId: input.customer.taxId,
      customerName: input.customer.name,
      customerAddress: input.customer.address,
      serviceCode: input.service.nationalServiceCode,
      nbsCode: input.service.nbsCode,
      description: input.service.description,
      amount: input.service.amount,
      issRate: input.service.issRate,
      issWithholding: input.service.issWithholding,
      issExigibility: '1',
      serviceCityCode: input.service.serviceLocationCityCode ?? '3548500',
    });
    await this.artifacts.save(operation.invoiceId, 'giss_rps_xml', rps, { rps_number: rpsNumber, series: 'TA' });
    const material = await this.vault.getActiveMaterial(input.companyId);
    const signedRps = this.signatures.signRps(rps, material);
    await this.artifacts.save(operation.invoiceId, 'giss_rps_signed_xml', signedRps, { rps_number: rpsNumber, series: 'TA' });
    const batchNumber = rpsNumber;
    const batch = buildAbrasfLoteRps({ batchNumber, providerTaxId: company.tax_id, municipalRegistration: company.municipal_registration, rpsXml: signedRps });
    await this.artifacts.save(operation.invoiceId, 'giss_batch_xml', batch, { batch_number: batchNumber, rps_number: rpsNumber, series: 'TA' });
    const signedBatch = this.signatures.signBatch(batch, material);
    await this.artifacts.save(operation.invoiceId, 'giss_batch_signed_xml', signedBatch, { batch_number: batchNumber, rps_number: rpsNumber, series: 'TA' });
    await this.reconciliation.beforeIssue({ cityCode: '3548500', providerTaxId: company.tax_id, municipalRegistration: company.municipal_registration, number: rpsNumber, series: 'TA' });
    // No SOAP POST is reachable until reconciliation is validated end-to-end.
    throw new FiscalEngineError(
      'TA_GISS_INTEGRATION_NOT_CONFIGURED',
      'Santos requires the municipal GISS route. TaxAgent has resolved the provider, but live transmission remains blocked until the WSDL operation, SOAP contract and reconciliation transport are validated end-to-end.',
      false,
      { provider: this.name, city_code: '3548500', endpoint: gissEndpointPolicy('3548500'), transmission_attempted: false },
    );
  }

  async cancel(_input: CancelFiscalInput, _operation: FiscalOperationContext): Promise<EventResult> {
    throw new FiscalEngineError(
      'TA_GISS_INTEGRATION_NOT_CONFIGURED',
      'Santos cancellation requires the municipal GISS integration. No external request was sent.',
      false,
      { provider: this.name, city_code: '3548500', endpoint: gissEndpointPolicy('3548500'), transmission_attempted: false },
    );
  }
}
