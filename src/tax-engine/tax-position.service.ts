import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';

interface DecisionRow { id: string; company_id: string | null; effective_at: string | Date; status: string; output: any; sources: any }
interface InvoiceRow { id: string; company_id: string; tax_decision_id: string | null; status: string }

@Injectable()
export class TaxPositionService {
  constructor(private readonly db: DatabaseService) {}

  async recordAuthorizedInvoice(invoiceId: string): Promise<void> {
    const { rows } = await this.db.query<InvoiceRow>('SELECT id, company_id, tax_decision_id, status FROM invoices WHERE id=$1', [invoiceId]);
    const invoice = rows[0];
    if (!invoice || invoice.status !== 'authorized' || !invoice.tax_decision_id) return;
    const decision = await this.getDecision(invoice.tax_decision_id, invoice.company_id);
    const calculation = decision.output?.calculation;
    if (!calculation || calculation.kind !== '2026-test-reference' || !calculation.amounts || !calculation.rates) return;

    for (const taxType of ['IBS', 'CBS'] as const) {
      const key = taxType.toLowerCase();
      const amount = Number(calculation.amounts[key]);
      const rate = Number(calculation.rates[key]);
      if (!Number.isFinite(amount) || !Number.isFinite(rate)) continue;
      await this.db.query(
        `INSERT INTO tax_ledger_entries(id, company_id, invoice_id, tax_decision_id, effective_at, tax_type, entry_type, base_amount, rate, amount, reference_only, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,'debit',$7,$8,$9,TRUE,$10::jsonb)
         ON CONFLICT(invoice_id, tax_type, entry_type) WHERE invoice_id IS NOT NULL DO NOTHING`,
        [createId('taxle'), invoice.company_id, invoice.id, decision.id, this.dateOnly(decision.effective_at), taxType, calculation.base, rate, amount, JSON.stringify({ kind: calculation.kind, sources: decision.sources })],
      );
    }
  }

  async getPosition(companyId: string, period: string) {
    if (!/^\d{4}-\d{2}$/.test(period)) throw new BadRequestException('period must be YYYY-MM');
    const start = `${period}-01`;
    const { rows } = await this.db.query<{ tax_type: 'IBS' | 'CBS'; entry_type: string; amount: string; reference_only: boolean }>(
      `SELECT tax_type, entry_type, COALESCE(SUM(amount),0)::text AS amount, BOOL_AND(reference_only) AS reference_only
       FROM tax_ledger_entries
       WHERE company_id=$1 AND effective_at >= $2::date AND effective_at < ($2::date + INTERVAL '1 month')
       GROUP BY tax_type, entry_type ORDER BY tax_type, entry_type`,
      [companyId, start],
    );
    const position = { IBS: { debits: 0, credits: 0, adjustments: 0, balance: 0 }, CBS: { debits: 0, credits: 0, adjustments: 0, balance: 0 } };
    for (const row of rows) {
      const amount = Number(row.amount);
      const target = position[row.tax_type];
      if (row.entry_type === 'debit') target.debits += amount;
      else if (row.entry_type === 'credit') target.credits += amount;
      else target.adjustments += amount;
    }
    for (const target of [position.IBS, position.CBS]) target.balance = this.money(target.debits - target.credits + target.adjustments);
    return {
      company_id: companyId,
      period,
      mode: 'taxagent-reference-position',
      authoritative_assessment: false,
      warning: 'This position aggregates TaxAgent ledger entries and is not the government assisted assessment. 2026 test-year entries are informational/reference-only.',
      position,
      entries: rows,
    };
  }

  async getDecision(id: string, companyId?: string): Promise<DecisionRow> {
    const { rows } = await this.db.query<DecisionRow>('SELECT id, company_id, effective_at, status, output, sources FROM tax_decisions WHERE id=$1', [id]);
    const decision = rows[0];
    if (!decision) throw new NotFoundException('Tax decision not found');
    if (companyId && decision.company_id && decision.company_id !== companyId) throw new NotFoundException('Tax decision not found');
    return decision;
  }
  private dateOnly(value: string | Date): string { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10); }
  private money(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }
}
