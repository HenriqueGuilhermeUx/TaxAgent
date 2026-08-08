import { Injectable, NotFoundException } from '@nestjs/common';
import { FiscalRouterService } from '../fiscal-core/fiscal-router.service';
import { IssueResult } from '../fiscal-core/fiscal.types';
import { JobsService } from '../jobs/jobs.service';
import { FiscalLedgerService } from '../ledger/fiscal-ledger.service';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoicesRepository } from './invoices.repository';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly repository: InvoicesRepository,
    private readonly router: FiscalRouterService,
    private readonly taxEngine: TaxEngineService,
    private readonly ledger: FiscalLedgerService,
    private readonly jobs: JobsService,
  ) {}

  async create(dto: CreateInvoiceDto, idempotencyKey?: string) {
    if (idempotencyKey) {
      const existing = await this.repository.findByIdempotency(dto.company_id, idempotencyKey);
      if (existing) return this.toAccepted(existing);
    }

    const input = this.taxEngine.validate({
      companyId: dto.company_id,
      environment: dto.environment,
      customer: {
        taxId: dto.customer.tax_id,
        name: dto.customer.name,
        cityCode: dto.customer.city_code,
      },
      service: {
        description: dto.service.description,
        amount: dto.service.amount,
        nationalServiceCode: dto.service.national_service_code,
      },
    });

    const invoice = await this.repository.create(input, idempotencyKey);
    await this.ledger.append({ invoiceId: invoice.id, type: 'invoice.created', payload: { environment: input.environment } });
    await this.jobs.enqueue('issue_invoice', { invoiceId: invoice.id });
    await this.ledger.append({ invoiceId: invoice.id, type: 'invoice.queued' });
    return this.toAccepted(invoice);
  }

  async findOne(id: string) {
    const invoice = await this.repository.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    return { ...invoice, ledger: await this.ledger.findByInvoice(id) };
  }

  async process(id: string, attemptNumber: number): Promise<void> {
    const invoice = await this.repository.findById(id);
    if (!invoice || invoice.status === 'authorized' || invoice.status === 'cancelled') return;

    await this.repository.markProcessing(id);
    await this.ledger.append({ invoiceId: id, type: 'invoice.processing', payload: { attempt: attemptNumber } });

    let attemptId: string | undefined;
    try {
      const provider = await this.router.resolve({
        companyId: invoice.canonical_input.companyId,
        environment: invoice.canonical_input.environment,
        customerCityCode: invoice.canonical_input.customer.cityCode,
      });
      attemptId = await this.repository.createAttempt(id, provider.name, attemptNumber, invoice.canonical_input);
      const result = await provider.issue(invoice.canonical_input);
      await this.repository.finishAttempt(attemptId, result.status, result);
      await this.repository.saveResult(id, result);
      await this.ledger.append({
        invoiceId: id,
        type: result.status === 'authorized' ? 'invoice.authorized' : 'invoice.rejected',
        payload: result,
      });
    } catch (error) {
      const result: IssueResult = {
        status: 'rejected',
        provider: 'taxagent',
        rejection: {
          code: 'TA_ENGINE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown engine error',
          retryable: true,
        },
      };
      if (attemptId) await this.repository.finishAttempt(attemptId, 'error', result, result.rejection?.code, result.rejection?.message);
      await this.repository.saveResult(id, result);
      await this.ledger.append({ invoiceId: id, type: 'invoice.error', payload: result });
      throw error;
    }
  }

  private toAccepted(invoice: { id: string; status: string; environment: string }) {
    return { id: invoice.id, status: invoice.status, environment: invoice.environment };
  }
}
