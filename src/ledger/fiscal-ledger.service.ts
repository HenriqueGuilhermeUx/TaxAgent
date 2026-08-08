import { Injectable } from '@nestjs/common';

export interface LedgerEntry {
  invoiceId: string;
  type: 'invoice.created' | 'invoice.authorized' | 'invoice.rejected';
  at: string;
  payload?: unknown;
}

@Injectable()
export class FiscalLedgerService {
  private readonly entries: LedgerEntry[] = [];

  append(entry: LedgerEntry): void {
    this.entries.push(entry);
  }

  findByInvoice(invoiceId: string): LedgerEntry[] {
    return this.entries.filter((entry) => entry.invoiceId === invoiceId);
  }
}
