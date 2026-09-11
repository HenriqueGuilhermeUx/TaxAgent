import { BadRequestException, Injectable } from '@nestjs/common';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';

export type EconomicOperationInput = {
  operation_type: 'sale' | 'purchase' | 'service_provided' | 'service_received' | 'other';
  direction: 'inbound' | 'outbound';
  gross_amount: number;
  currency?: string;
  occurred_at?: string;
  counterparty_tax_id?: string;
  counterparty_name?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class EconomicOperationService {
  constructor(private readonly db: DatabaseService) {}

  async create(companyId: string, environment: FiscalEnvironment, input: EconomicOperationInput) {
    if (!['sale','purchase','service_provided','service_received','other'].includes(input.operation_type)) throw new BadRequestException('Invalid operation_type');
    if (!['inbound','outbound'].includes(input.direction)) throw new BadRequestException('Invalid direction');
    if (!Number.isFinite(input.gross_amount) || input.gross_amount < 0) throw new BadRequestException('gross_amount must be zero or positive');
    const occurredAt = input.occurred_at ? new Date(input.occurred_at) : null;
    if (occurredAt && Number.isNaN(occurredAt.getTime())) throw new BadRequestException('occurred_at must be a valid datetime');
    const { rows } = await this.db.query<any>(
      `INSERT INTO economic_operations(id, company_id, environment, operation_type, direction, counterparty_tax_id, counterparty_name, currency, gross_amount, occurred_at, metadata)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) RETURNING *`,
      [createId('op'), companyId, environment, input.operation_type, input.direction, this.digits(input.counterparty_tax_id), input.counterparty_name ?? null, input.currency ?? 'BRL', input.gross_amount, occurredAt?.toISOString() ?? null, JSON.stringify(input.metadata ?? {})],
    );
    return this.public(rows[0]);
  }

  async list(companyId: string, environment: FiscalEnvironment, status?: string, limit = 100) {
    const safeLimit = Math.min(500, Math.max(1, Math.trunc(Number(limit) || 100)));
    const statuses = ['open','partially_settled','settled','divergent','cancelled'];
    if (status && !statuses.includes(status)) throw new BadRequestException('Invalid operation status');
    const { rows } = await this.db.query<any>(
      `SELECT o.*,
              COALESCE((SELECT SUM(p.amount) FROM payment_records p WHERE p.economic_operation_id=o.id),0)::text AS paid_amount,
              (SELECT COUNT(*)::int FROM payment_records p WHERE p.economic_operation_id=o.id) AS payment_count,
              (SELECT COUNT(*)::int FROM document_intakes d WHERE d.economic_operation_id=o.id) AS document_count
       FROM economic_operations o
       WHERE o.company_id=$1 AND o.environment=$2 AND ($3::text IS NULL OR o.status=$3)
       ORDER BY COALESCE(o.occurred_at, o.created_at) DESC LIMIT $4`,
      [companyId, environment, status ?? null, safeLimit],
    );
    return {
      company_id: companyId,
      environment,
      count: rows.length,
      items: rows.map((row) => ({
        ...this.public(row),
        settlement: {
          paid_amount: this.money(Number(row.paid_amount ?? 0)),
          outstanding_amount: this.money(Math.max(0, Number(row.gross_amount) - Number(row.paid_amount ?? 0))),
          delta: this.money(Number(row.paid_amount ?? 0) - Number(row.gross_amount)),
          payment_count: Number(row.payment_count ?? 0),
          document_count: Number(row.document_count ?? 0),
        },
      })),
    };
  }

  async findByIntake(intakeId: string, companyId: string, environment: FiscalEnvironment) {
    const { rows } = await this.db.query<{ economic_operation_id: string | null }>(
      `SELECT economic_operation_id FROM document_intakes WHERE id=$1 AND company_id=$2 AND environment=$3`,
      [intakeId, companyId, environment],
    );
    if (!rows[0]) throw new BadRequestException('Document intake not found');
    if (!rows[0].economic_operation_id) return null;
    return this.get(rows[0].economic_operation_id, companyId, environment);
  }

  async linkIntake(operationId: string, intakeId: string, companyId: string, environment: FiscalEnvironment) {
    await this.requireOperation(operationId, companyId, environment);
    const { rows } = await this.db.query<any>(
      `UPDATE document_intakes SET economic_operation_id=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3 AND environment=$4 RETURNING id`,
      [operationId, intakeId, companyId, environment],
    );
    if (!rows[0]) throw new BadRequestException('Document intake not found');
    return this.get(operationId, companyId, environment);
  }

  async linkPayment(operationId: string, paymentId: string, companyId: string, environment: FiscalEnvironment) {
    await this.requireOperation(operationId, companyId, environment);
    const { rows } = await this.db.query<any>(
      `UPDATE payment_records SET economic_operation_id=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3 AND environment=$4 RETURNING id`,
      [operationId, paymentId, companyId, environment],
    );
    if (!rows[0]) throw new BadRequestException('Payment record not found');
    return this.get(operationId, companyId, environment);
  }

  async bindConfirmedMatch(intakeId: string, paymentId: string, companyId: string, environment: FiscalEnvironment) {
    const operationId = await this.db.withTransaction(async (client) => {
      const intakeResult = await client.query<any>(
        `SELECT id, economic_operation_id, linked_invoice_id, canonical_document
         FROM document_intakes WHERE id=$1 AND company_id=$2 AND environment=$3 FOR UPDATE`,
        [intakeId, companyId, environment],
      );
      const paymentResult = await client.query<any>(
        `SELECT id, economic_operation_id, direction, amount, currency, occurred_at, counterparty_tax_id, counterparty_name
         FROM payment_records WHERE id=$1 AND company_id=$2 AND environment=$3 FOR UPDATE`,
        [paymentId, companyId, environment],
      );
      const intake = intakeResult.rows[0];
      const payment = paymentResult.rows[0];
      if (!intake || !payment) throw new BadRequestException('Confirmed reconciliation references missing document or payment');
      if (intake.economic_operation_id && payment.economic_operation_id && intake.economic_operation_id !== payment.economic_operation_id) {
        throw new BadRequestException('Document and payment belong to different economic operations');
      }

      let id = intake.economic_operation_id ?? payment.economic_operation_id ?? null;
      if (!id) {
        const doc = intake.canonical_document ?? {};
        const grossAmount = Number(doc.total?.amount ?? payment.amount ?? 0);
        const issuedAt = doc.issued_at ? new Date(doc.issued_at) : null;
        const taxId = this.digits(payment.counterparty_tax_id ?? doc.supplier?.tax_id ?? doc.customer?.tax_id);
        const name = payment.counterparty_name ?? doc.supplier?.name ?? doc.customer?.name ?? null;
        id = createId('op');
        await client.query(
          `INSERT INTO economic_operations(id, company_id, environment, operation_type, direction, counterparty_tax_id, counterparty_name, currency, gross_amount, occurred_at, metadata)
           VALUES($1,$2,$3,'other',$4,$5,$6,$7,$8,$9,$10::jsonb)`,
          [id, companyId, environment, payment.direction, taxId, name, doc.total?.currency ?? payment.currency ?? 'BRL', grossAmount, issuedAt && !Number.isNaN(issuedAt.getTime()) ? issuedAt.toISOString() : payment.occurred_at, JSON.stringify({ source: 'confirmed_payment_match', intake_id: intakeId, payment_id: paymentId, tax_effect_applied: false })],
        );
      }

      await client.query(`UPDATE document_intakes SET economic_operation_id=$2, updated_at=NOW() WHERE id=$1`, [intakeId, id]);
      await client.query(`UPDATE payment_records SET economic_operation_id=$2, updated_at=NOW() WHERE id=$1`, [paymentId, id]);
      await client.query(`UPDATE tax_position_financial_evidence SET economic_operation_id=$3 WHERE intake_id=$1 AND payment_id=$2`, [intakeId, paymentId, id]);
      if (intake.linked_invoice_id) {
        await client.query(
          `INSERT INTO ledger_entries(invoice_id, event_type, payload) VALUES($1,'economic-operation.linked',$2::jsonb)`,
          [intake.linked_invoice_id, JSON.stringify({ economic_operation_id: id, intake_id: intakeId, payment_id: paymentId, source: 'confirmed_payment_match', tax_effect_applied: false })],
        );
      }
      return id as string;
    });
    return this.get(operationId, companyId, environment);
  }

  async get(operationId: string, companyId: string, environment: FiscalEnvironment) {
    const operation = await this.requireOperation(operationId, companyId, environment);
    const [documents, payments] = await Promise.all([
      this.db.query<any>(`SELECT id, document_type, authority, confidence, canonical_document, status, linked_invoice_id, created_at FROM document_intakes WHERE economic_operation_id=$1 AND company_id=$2 AND environment=$3 ORDER BY created_at`, [operationId, companyId, environment]),
      this.db.query<any>(`SELECT id, external_id, direction, amount, currency, occurred_at, counterparty_tax_id, counterparty_name, reference FROM payment_records WHERE economic_operation_id=$1 AND company_id=$2 AND environment=$3 ORDER BY occurred_at`, [operationId, companyId, environment]),
    ]);
    const paid = payments.rows.reduce((sum, row) => sum + Number(row.amount), 0);
    const gross = Number(operation.gross_amount);
    const delta = this.money(paid - gross);
    const settlementStatus = paid <= 0 ? 'open' : Math.abs(delta) <= 0.01 ? 'settled' : paid < gross ? 'partially_settled' : 'divergent';
    if (operation.status !== 'cancelled' && operation.status !== settlementStatus) {
      await this.db.query(`UPDATE economic_operations SET status=$2, updated_at=NOW() WHERE id=$1`, [operationId, settlementStatus]);
      operation.status = settlementStatus;
    }
    return { ...this.public(operation), settlement: { paid_amount: this.money(paid), outstanding_amount: this.money(Math.max(0, gross - paid)), delta, payment_count: payments.rows.length, document_count: documents.rows.length }, documents: documents.rows, payments: payments.rows };
  }

  private async requireOperation(id: string, companyId: string, environment: FiscalEnvironment): Promise<any> {
    const { rows } = await this.db.query<any>('SELECT * FROM economic_operations WHERE id=$1 AND company_id=$2 AND environment=$3', [id, companyId, environment]);
    if (!rows[0]) throw new BadRequestException('Economic operation not found');
    return rows[0];
  }
  private public(row: any) { return { ...row, gross_amount: Number(row.gross_amount) }; }
  private digits(value?: string | null) { const x = String(value ?? '').replace(/\D/g, ''); return x || null; }
  private money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
}
