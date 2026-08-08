import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FiscalRouterService } from '../fiscal-core/fiscal-router.service';
import {
  CanonicalInvoiceInput,
  InvoiceStatus,
  IssueResult,
} from '../fiscal-core/fiscal.types';
import { FiscalLedgerService } from '../ledger/fiscal-ledger.service';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

interface InvoiceRecord {
  id: string;
  status: InvoiceStatus;
  input: CanonicalInvoiceInput;
  result?: IssueResult;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class InvoicesService {
  private readonly invoices = new Map<string, InvoiceRecord>();

  constructor(
    private readonly router: FiscalRouterService,
    private readonly taxEngine: TaxEngineService,
    private readonly ledger: FiscalLedgerService,
  ) {}

  create(dto: CreateInvoiceDto) {
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

    const now = new Date().toISOString();
    const invoice: InvoiceRecord = {
      id: `inv_${randomUUID().replaceAll('-', '')}`,
      status: 'processing',
      input,
      createdAt: now,
      updatedAt: now,
    };

    this.invoices.set(invoice.id, invoice);
    this.ledger.append({ invoiceId: invoice.id, type: 'invoice.created', at: now });
    void this.process(invoice.id);

    return { id: invoice.id, status: invoice.status, environment: input.environment };
  }

  findOne(id: string) {
    const invoice = this.invoices.get(id);
    if (!invoice) throw new NotFoundException('Invoice not found');

    return {
      ...invoice,
      ledger: this.ledger.findByInvoice(id),
    };
  }

  private async process(id: string): Promise<void> {
    const invoice = this.invoices.get(id);
    if (!invoice) return;

    try {
      const provider = await this.router.resolve({
        companyId: invoice.input.companyId,
        environment: invoice.input.environment,
        customerCityCode: invoice.input.customer.cityCode,
      });
      const result = await provider.issue(invoice.input);
      invoice.status = result.status;
      invoice.result = result;
      invoice.updatedAt = new Date().toISOString();
      this.ledger.append({
        invoiceId: id,
        type: result.status === 'authorized' ? 'invoice.authorized' : 'invoice.rejected',
        at: invoice.updatedAt,
        payload: result,
      });
    } catch (error) {
      invoice.status = 'rejected';
      invoice.updatedAt = new Date().toISOString();
      invoice.result = {
        status: 'rejected',
        provider: 'taxagent',
        rejection: {
          code: 'TA_ENGINE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown engine error',
          retryable: false,
        },
      };
      this.ledger.append({
        invoiceId: id,
        type: 'invoice.rejected',
        at: invoice.updatedAt,
        payload: invoice.result,
      });
    }
  }
}
