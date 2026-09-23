import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FiscalEngineError, normalizeEngineError } from '../fiscal-core/fiscal-engine.error';
import { FiscalRouterService } from '../fiscal-core/fiscal-router.service';
import { CanonicalInvoiceInput, CanonicalService, IssueResult } from '../fiscal-core/fiscal.types';
import { JobsService } from '../jobs/jobs.service';
import { FiscalLedgerService } from '../ledger/fiscal-ledger.service';
import { PreparedDpsService } from '../prepared-dps/prepared-dps.service';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import { TaxPositionService } from '../tax-engine/tax-position.service';
import { TenancyService } from '../tenancy/tenancy.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { CancelInvoiceDto } from './dto/cancel-invoice.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoicesRepository } from './invoices.repository';

const MAX_ATTEMPTS = 5;

type RoutingCompany = { city_code: string; tax_regime?: string };

@Injectable()
export class InvoicesService {
  constructor(
    private readonly repository: InvoicesRepository,
    private readonly router: FiscalRouterService,
    private readonly taxEngine: TaxEngineService,
    private readonly taxPosition: TaxPositionService,
    private readonly ledger: FiscalLedgerService,
    private readonly jobs: JobsService,
    private readonly webhooks: WebhooksService,
    private readonly tenancy: TenancyService,
    private readonly preparedDps: PreparedDpsService,
  ) {}

  async create(dto: CreateInvoiceDto, idempotencyKey?: string) {
    if (idempotencyKey) {
      const existing = await this.repository.findByIdempotency(dto.company_id, idempotencyKey);
      if (existing) return this.toAccepted(existing);
    }
    if (dto.prepared_dps_id) {
      const existing = await this.repository.findByPreparedDps(dto.prepared_dps_id);
      if (existing) {
        if (existing.company_id !== dto.company_id) throw new ForbiddenException('Prepared DPS is already bound to another company invoice');
        return this.toAccepted(existing);
      }
    }

    const company = await this.tenancy.getCompany(dto.company_id) as RoutingCompany;
    const live = (process.env.TAXAGENT_NFSE_MODE ?? 'mock') === 'live';
    let prepared = dto.prepared_dps_id ? await this.preparedDps.get(dto.prepared_dps_id, dto.company_id) : undefined;
    const taxDecisionId = dto.tax_decision_id ?? prepared?.tax_decision_id;
    if (live && !taxDecisionId) throw new BadRequestException('Live NFS-e operations require a resolved tax_decision_id; TaxAgent will not transmit manually typed RTC classifications without a persisted tax decision');
    if (prepared && dto.tax_decision_id && dto.tax_decision_id !== prepared.tax_decision_id) throw new BadRequestException('Prepared DPS tax decision does not match invoice tax_decision_id');

    let service: CanonicalService = {
      description: dto.service.description,
      amount: dto.service.amount,
      nationalServiceCode: dto.service.national_service_code,
      nbsCode: dto.service.nbs,
      serviceLocationCityCode: dto.service.service_location_city_code,
      issTaxation: dto.service.iss_taxation,
      issWithholding: dto.service.iss_withholding,
      issRate: dto.service.iss_rate,
      finalConsumption: dto.service.final_consumption,
      operationIndicator: dto.service.operation_indicator,
      taxSituation: dto.service.tax_situation,
      taxClassification: dto.service.tax_classification,
    };
    if (taxDecisionId) service = await this.taxEngine.hydrateServiceFromDecision(dto.company_id, taxDecisionId, service);

    let input: CanonicalInvoiceInput = this.taxEngine.validate({
      companyId: dto.company_id,
      environment: dto.environment,
      competence: dto.competence,
      customer: {
        taxId: dto.customer.tax_id,
        name: dto.customer.name,
        cityCode: dto.customer.city_code,
        address: dto.customer.address ? {
          street: dto.customer.address.street,
          number: dto.customer.address.number,
          district: dto.customer.address.district,
          postalCode: dto.customer.address.postal_code,
          cityCode: dto.customer.address.city_code,
        } : undefined,
      },
      service,
    });

    if (prepared) {
      prepared = await this.preparedDps.assertBindable(dto.prepared_dps_id!, dto, input);
      input = prepared.canonical_input;
    }

    if (live) {
      const provider = await this.resolveProvider(input, company);
      this.assertProviderArtifactPolicy(provider.name, Boolean(prepared));
    }

    const invoice = await this.repository.create(input, idempotencyKey, taxDecisionId, dto.prepared_dps_id);
    await this.ledger.append({ invoiceId: invoice.id, type: 'invoice.created', payload: { environment: input.environment, tax_decision_id: taxDecisionId ?? null, prepared_dps_id: dto.prepared_dps_id ?? null } });
    await this.jobs.enqueue('issue_invoice', { invoiceId: invoice.id });
    await this.ledger.append({ invoiceId: invoice.id, type: 'invoice.queued' });
    return this.toAccepted(invoice);
  }

  async findOneForCompany(id: string, companyId?: string) {
    const invoice = await this.repository.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (companyId && invoice.company_id !== companyId) throw new ForbiddenException('Invoice belongs to another company');
    return { ...invoice, ledger: await this.ledger.findByInvoice(id) };
  }

  async reprocessRouteFailure(id: string, companyId: string | undefined) {
    const invoice = await this.repository.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (companyId && invoice.company_id !== companyId) throw new ForbiddenException('Invoice belongs to another company');
    if (invoice.environment !== 'test') throw new BadRequestException('Safe route-failure reprocessing is restricted to Produção Restrita');
    if (invoice.status !== 'rejected' || !invoice.prepared_dps_id) throw new BadRequestException('Invoice is not an eligible rejected Prepared DPS operation');
    const rejection = invoice.rejection && typeof invoice.rejection === 'object' ? invoice.rejection as { code?: string; message?: string } : {};
    if (rejection.code !== 'NFSE_NON_JSON_RESPONSE' || !String(rejection.message ?? '').includes('(404)')) throw new BadRequestException('Only the known pre-SEFIN 404 route failure can use this recovery path');
    const changed = await this.repository.requeueRejectedRouteFailure(id);
    if (!changed) throw new BadRequestException('Invoice state changed; re-read it before attempting recovery');
    await this.ledger.append({ invoiceId: id, type: 'invoice.reprocess_queued', payload: { reason: 'known_sefin_route_404', prepared_dps_id: invoice.prepared_dps_id, strategy: 'reconcile_by_dps_then_same_signed_xml' } });
    await this.jobs.enqueue('issue_invoice', { invoiceId: id });
    return { id, status: 'retrying', prepared_dps_id: invoice.prepared_dps_id, strategy: 'reconcile_by_dps_then_same_signed_xml' };
  }

  async requestCancellation(id: string, companyId: string | undefined, dto: CancelInvoiceDto) {
    const invoice = await this.repository.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (companyId && invoice.company_id !== companyId) throw new ForbiddenException('Invoice belongs to another company');
    if (invoice.status !== 'authorized' || !invoice.access_key) throw new BadRequestException('Only an authorized invoice with access key can be cancelled');
    await this.repository.markCancelling(id);
    await this.jobs.enqueue('cancel_invoice', { invoiceId: id, reasonCode: dto.reason_code, reason: dto.reason });
    await this.ledger.append({ invoiceId: id, type: 'invoice.cancellation_requested', payload: { reason_code: dto.reason_code, reason: dto.reason } });
    return { id, status: 'cancelling' };
  }

  async process(id: string, attemptNumber: number): Promise<void> {
    const invoice = await this.repository.findById(id);
    if (!invoice || invoice.status === 'authorized' || invoice.status === 'cancelled') return;
    const company = await this.tenancy.getCompany(invoice.company_id) as RoutingCompany;
    await this.repository.markProcessing(id);
    await this.ledger.append({ invoiceId: id, type: 'invoice.processing', payload: { attempt: attemptNumber, prepared_dps_id: invoice.prepared_dps_id } });
    let attemptId: string | undefined;
    try {
      const live = (process.env.TAXAGENT_NFSE_MODE ?? 'mock') === 'live';
      if (live && !invoice.tax_decision_id) throw new FiscalEngineError('TA_TAX_DECISION_REQUIRED', 'Live NFS-e processing requires a persisted resolved tax decision bound to the invoice', false);

      const provider = await this.resolveProvider(invoice.canonical_input, company);
      if (live) this.assertProviderArtifactPolicy(provider.name, Boolean(invoice.prepared_dps_id), true);
      await this.ledger.append({ invoiceId: id, type: 'invoice.route_resolved', payload: { provider: provider.name, issuer_city_code: company.city_code, prepared_dps_id: invoice.prepared_dps_id ?? null } });

      attemptId = await this.repository.createAttempt(id, provider.name, attemptNumber, { canonical_input: invoice.canonical_input, prepared_dps_id: invoice.prepared_dps_id });
      const result = await provider.issue(invoice.canonical_input, { invoiceId: id, preparedDpsId: provider.name === 'nfse-national' ? invoice.prepared_dps_id ?? undefined : undefined });
      await this.repository.finishAttempt(attemptId, result.status, result);
      await this.repository.saveResult(id, result);
      const eventType = result.status === 'authorized' ? 'invoice.authorized' : 'invoice.rejected';
      await this.ledger.append({ invoiceId: id, type: eventType, payload: result });
      if (result.status === 'authorized') {
        if (provider.name === 'nfse-national' && invoice.prepared_dps_id) await this.preparedDps.markConsumed(invoice.prepared_dps_id);
        await this.taxPosition.recordAuthorizedInvoice(id);
        if ((process.env.TAXAGENT_NFSE_MODE ?? 'mock') !== 'mock') await this.jobs.enqueue('generate_danfse', { invoiceId: id });
      }
      await this.webhooks.emit(invoice.company_id, eventType, { invoice_id: id, result });
    } catch (error) {
      await this.handleIssueFailure(invoice.id, invoice.company_id, attemptId, attemptNumber, error);
    }
  }

  async processCancellation(id: string, reasonCode: string, reason: string, attemptNumber: number): Promise<void> {
    const invoice = await this.repository.findById(id);
    if (!invoice || !invoice.access_key || invoice.status === 'cancelled') return;
    const company = await this.tenancy.getCompany(invoice.company_id) as RoutingCompany;
    try {
      const provider = await this.resolveProvider(invoice.canonical_input, company);
      const result = await provider.cancel({ companyId: invoice.company_id, environment: invoice.environment, accessKey: invoice.access_key, reasonCode, reason }, { invoiceId: id, preparedDpsId: provider.name === 'nfse-national' ? invoice.prepared_dps_id ?? undefined : undefined });
      await this.repository.createFiscalEvent(id, provider.name, 'cancellation', result.providerReference, result);
      if (result.status === 'registered') {
        await this.repository.markCancelled(id);
        await this.ledger.append({ invoiceId: id, type: 'invoice.cancelled', payload: result });
        await this.webhooks.emit(invoice.company_id, 'invoice.cancelled', { invoice_id: id, result });
        return;
      }
      await this.repository.restoreAuthorized(id);
      await this.ledger.append({ invoiceId: id, type: 'invoice.cancellation_rejected', payload: result });
      await this.webhooks.emit(invoice.company_id, 'invoice.cancellation_rejected', { invoice_id: id, result });
    } catch (error) {
      const normalized = normalizeEngineError(error);
      const exhausted = attemptNumber >= MAX_ATTEMPTS;
      if (normalized.retryable && !exhausted) {
        await this.ledger.append({ invoiceId: id, type: 'invoice.cancellation_retry_scheduled', payload: { attempt: attemptNumber, code: normalized.code } });
        throw error;
      }
      await this.repository.restoreAuthorized(id);
      await this.ledger.append({ invoiceId: id, type: 'invoice.cancellation_failed', payload: { code: normalized.code, message: normalized.message } });
      await this.webhooks.emit(invoice.company_id, 'invoice.cancellation_failed', { invoice_id: id, error: normalized });
    }
  }

  private async resolveProvider(input: CanonicalInvoiceInput, company: RoutingCompany) {
    const serviceLocationCityCode = input.service.serviceLocationCityCode ?? input.customer.cityCode;
    return this.router.resolve({
      companyId: input.companyId,
      environment: input.environment,
      issuerCityCode: company.city_code,
      serviceLocationCityCode,
      taxRegime: company.tax_regime,
      effectiveAt: input.competence,
    });
  }

  private assertProviderArtifactPolicy(providerName: string, hasPreparedDps: boolean, engineError = false): void {
    if (providerName === 'nfse-national' && !hasPreparedDps) {
      const message = 'National-direct live NFS-e processing requires an immutable Prepared DPS; TaxAgent will not rebuild a national DPS at transmission time';
      if (engineError) throw new FiscalEngineError('TA_PREPARED_DPS_REQUIRED', message, false, { provider: providerName, transmission_attempted: false });
      throw new BadRequestException(message);
    }
    if (providerName !== 'nfse-national' && hasPreparedDps) {
      const message = `Prepared DPS is a national-direct transmission artifact and cannot be bound to provider ${providerName}`;
      if (engineError) throw new FiscalEngineError('TA_PREPARED_DPS_PROVIDER_MISMATCH', message, false, { provider: providerName, transmission_attempted: false });
      throw new BadRequestException(message);
    }
  }

  private async handleIssueFailure(id: string, companyId: string, attemptId: string | undefined, attemptNumber: number, error: unknown) {
    const normalized = normalizeEngineError(error);
    if (attemptId) await this.repository.finishAttempt(attemptId, 'error', normalized, normalized.code, normalized.message);
    const exhausted = attemptNumber >= MAX_ATTEMPTS;
    if (normalized.retryable && !exhausted) {
      await this.repository.markRetrying(id);
      await this.ledger.append({ invoiceId: id, type: 'invoice.retry_scheduled', payload: { attempt: attemptNumber, code: normalized.code, message: normalized.message } });
      throw error;
    }
    const result: IssueResult = {
      status: 'rejected',
      provider: 'taxagent',
      rejection: {
        code: exhausted && normalized.retryable ? 'TA_RETRIES_EXHAUSTED' : normalized.code,
        message: normalized.message,
        retryable: false,
        category: exhausted ? 'retry-exhausted' : 'engine',
      },
    };
    await this.repository.saveResult(id, result);
    await this.ledger.append({ invoiceId: id, type: 'invoice.rejected', payload: result });
    await this.webhooks.emit(companyId, 'invoice.rejected', { invoice_id: id, result });
  }

  private toAccepted(invoice: { id: string; status: string; environment: string; prepared_dps_id?: string | null }) {
    return { id: invoice.id, status: invoice.status, environment: invoice.environment, prepared_dps_id: invoice.prepared_dps_id ?? undefined };
  }
}
