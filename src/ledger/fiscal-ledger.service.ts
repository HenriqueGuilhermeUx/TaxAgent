import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class FiscalLedgerService {
  constructor(private readonly db: DatabaseService) {}

  async append(entry: { invoiceId: string; type: string; payload?: unknown }): Promise<void> {
    await this.db.query(
      'INSERT INTO ledger_entries(invoice_id, event_type, payload) VALUES ($1,$2,$3::jsonb)',
      [entry.invoiceId, entry.type, JSON.stringify(entry.payload ?? null)],
    );
  }

  async findByInvoice(invoiceId: string) {
    const { rows } = await this.db.query(
      'SELECT id, event_type AS type, payload, created_at AS at FROM ledger_entries WHERE invoice_id=$1 ORDER BY id',
      [invoiceId],
    );
    return rows;
  }
}
