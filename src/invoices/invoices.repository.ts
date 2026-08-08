import { Injectable } from '@nestjs/common';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { CanonicalInvoiceInput, InvoiceStatus, IssueResult } from '../fiscal-core/fiscal.types';

export interface InvoiceRecord { id: string; company_id: string; environment: 'test' | 'production'; status: InvoiceStatus; idempotency_key: string | null; canonical_input: CanonicalInvoiceInput; provider: string | null; provider_reference: string | null; access_key: string | null; rejection: unknown; tax_decision_id: string | null; created_at: Date; updated_at: Date }
@Injectable()
export class InvoicesRepository {
  constructor(private readonly db: DatabaseService) {}
  async findByIdempotency(companyId: string, key: string): Promise<InvoiceRecord | null> { const { rows } = await this.db.query<InvoiceRecord>('SELECT * FROM invoices WHERE company_id=$1 AND idempotency_key=$2', [companyId, key]); return rows[0] ?? null; }
  async create(input: CanonicalInvoiceInput, idempotencyKey?: string, taxDecisionId?: string): Promise<InvoiceRecord> {
    const id = createId('inv');
    const issuedAt = input.issuedAt ?? new Date().toISOString();
    const stableInput: CanonicalInvoiceInput = { ...input, issuedAt, competence: input.competence ?? issuedAt.slice(0, 10) };
    try { const { rows } = await this.db.query<InvoiceRecord>(`INSERT INTO invoices(id, company_id, environment, status, idempotency_key, canonical_input, tax_decision_id) VALUES ($1,$2,$3,'queued',$4,$5::jsonb,$6) RETURNING *`, [id, input.companyId, input.environment, idempotencyKey ?? null, JSON.stringify(stableInput), taxDecisionId ?? null]); return rows[0]; } catch (error) { const pgCode = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : undefined; if (pgCode === '23505' && idempotencyKey) { const existing = await this.findByIdempotency(input.companyId, idempotencyKey); if (existing) return existing; } throw error; }
  }
  async findById(id: string): Promise<InvoiceRecord | null> { const { rows } = await this.db.query<InvoiceRecord>('SELECT * FROM invoices WHERE id=$1', [id]); return rows[0] ?? null; }
  async markProcessing(id: string): Promise<void> { await this.db.query("UPDATE invoices SET status='processing', updated_at=NOW() WHERE id=$1", [id]); }
  async markRetrying(id: string): Promise<void> { await this.db.query("UPDATE invoices SET status='retrying', updated_at=NOW() WHERE id=$1", [id]); }
  async markCancelling(id: string): Promise<void> { await this.db.query("UPDATE invoices SET status='cancelling', updated_at=NOW() WHERE id=$1", [id]); }
  async markCancelled(id: string): Promise<void> { await this.db.query("UPDATE invoices SET status='cancelled', updated_at=NOW() WHERE id=$1", [id]); }
  async restoreAuthorized(id: string): Promise<void> { await this.db.query("UPDATE invoices SET status='authorized', updated_at=NOW() WHERE id=$1", [id]); }
  async saveResult(id: string, result: IssueResult): Promise<void> { await this.db.query(`UPDATE invoices SET status=$2, provider=$3, provider_reference=$4, access_key=$5, rejection=$6::jsonb, updated_at=NOW() WHERE id=$1`, [id, result.status, result.provider, result.providerReference ?? null, result.accessKey ?? null, JSON.stringify(result.rejection ?? null)]); }
  async createAttempt(invoiceId: string, provider: string, attempt: number, requestPayload: unknown): Promise<string> { const id = createId('att'); await this.db.query(`INSERT INTO invoice_attempts(id, invoice_id, provider, attempt, request_payload, status) VALUES ($1,$2,$3,$4,$5::jsonb,'processing')`, [id, invoiceId, provider, attempt, JSON.stringify(requestPayload)]); return id; }
  async finishAttempt(id: string, status: string, response: unknown, errorCode?: string, errorMessage?: string): Promise<void> { await this.db.query(`UPDATE invoice_attempts SET status=$2, response_payload=$3::jsonb, error_code=$4, error_message=$5, finished_at=NOW() WHERE id=$1`, [id, status, JSON.stringify(response ?? null), errorCode ?? null, errorMessage ?? null]); }
  async createFiscalEvent(invoiceId: string, provider: string, eventType: string, providerReference: string | undefined, payload: unknown): Promise<string> { const id = createId('fevt'); await this.db.query(`INSERT INTO fiscal_events(id, invoice_id, provider, event_type, provider_reference, payload) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [id, invoiceId, provider, eventType, providerReference ?? null, JSON.stringify(payload ?? null)]); return id; }
}
