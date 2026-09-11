import { BadRequestException, Injectable } from '@nestjs/common';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';

export type PaymentInput = {
  external_id?: string;
  direction: 'inbound' | 'outbound';
  amount: number;
  currency?: string;
  occurred_at: string;
  counterparty_tax_id?: string;
  counterparty_name?: string;
  reference?: string;
  metadata?: Record<string, unknown>;
};

type IntakeRow = { id: string; canonical_document: any; linked_invoice_id?: string | null };
type PaymentRow = PaymentInput & { id: string; company_id: string; environment: FiscalEnvironment; amount: string | number };
type MatchRow = { id: string; intake_id: string; payment_id: string; score: string | number; status: 'suggested' | 'confirmed' | 'rejected'; reasons: string[]; confirmed_at: Date | null };

@Injectable()
export class PaymentMatchingService {
  constructor(private readonly db: DatabaseService) {}

  async registerPayment(companyId: string, environment: FiscalEnvironment, input: PaymentInput) {
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new BadRequestException('Payment amount must be positive');
    if (!['inbound', 'outbound'].includes(input.direction)) throw new BadRequestException('Payment direction must be inbound or outbound');
    const occurredAt = new Date(input.occurred_at);
    if (Number.isNaN(occurredAt.getTime())) throw new BadRequestException('Payment occurred_at must be a valid datetime');
    const id = createId('pay');
    const { rows } = await this.db.query<PaymentRow>(
      `INSERT INTO payment_records(id, company_id, environment, external_id, direction, amount, currency, occurred_at, counterparty_tax_id, counterparty_name, reference, metadata)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
       ON CONFLICT(company_id, environment, external_id) DO UPDATE SET external_id=EXCLUDED.external_id
       RETURNING *`,
      [id, companyId, environment, input.external_id ?? null, input.direction, input.amount, input.currency ?? 'BRL', occurredAt.toISOString(), this.digits(input.counterparty_tax_id), input.counterparty_name ?? null, input.reference ?? null, JSON.stringify(input.metadata ?? {})],
    );
    return rows[0];
  }

  async suggest(intakeId: string, companyId: string, environment: FiscalEnvironment) {
    const intakeResult = await this.db.query<IntakeRow>(
      'SELECT id, canonical_document FROM document_intakes WHERE id=$1 AND company_id=$2 AND environment=$3',
      [intakeId, companyId, environment],
    );
    const intake = intakeResult.rows[0];
    if (!intake) throw new BadRequestException('Document intake not found');
    const doc = intake.canonical_document ?? {};
    const amount = Number(doc.total?.amount ?? 0);
    const issuedAt = doc.issued_at ? new Date(doc.issued_at) : null;
    const taxIds = [this.digits(doc.supplier?.tax_id), this.digits(doc.customer?.tax_id)].filter(Boolean);
    const payments = await this.db.query<PaymentRow>(
      `SELECT * FROM payment_records WHERE company_id=$1 AND environment=$2
       AND ($3::numeric <= 0 OR amount BETWEEN $3::numeric - 0.01 AND $3::numeric + 0.01)
       AND ($4::timestamptz IS NULL OR occurred_at BETWEEN $4::timestamptz - INTERVAL '45 days' AND $4::timestamptz + INTERVAL '45 days')
       ORDER BY occurred_at DESC LIMIT 100`,
      [companyId, environment, amount, issuedAt && !Number.isNaN(issuedAt.getTime()) ? issuedAt.toISOString() : null],
    );

    const suggestions = payments.rows.map((payment) => {
      const reasons: string[] = [];
      let score = 0;
      if (amount > 0 && Math.abs(Number(payment.amount) - amount) <= 0.01) { score += 0.6; reasons.push('exact_amount'); }
      const paymentTaxId = this.digits(payment.counterparty_tax_id);
      if (paymentTaxId && taxIds.includes(paymentTaxId)) { score += 0.25; reasons.push('counterparty_tax_id'); }
      if (issuedAt && !Number.isNaN(issuedAt.getTime())) {
        const days = Math.abs(new Date(payment.occurred_at).getTime() - issuedAt.getTime()) / 86400000;
        if (days <= 7) { score += 0.15; reasons.push('date_within_7_days'); }
        else if (days <= 30) { score += 0.08; reasons.push('date_within_30_days'); }
      }
      return { payment, score: Math.min(1, Number(score.toFixed(4))), reasons };
    }).filter((x) => x.score >= 0.6).sort((a, b) => b.score - a.score);

    for (const candidate of suggestions) {
      await this.db.query(
        `INSERT INTO document_payment_matches(id, company_id, environment, intake_id, payment_id, score, status, reasons)
         VALUES($1,$2,$3,$4,$5,$6,'suggested',$7::jsonb)
         ON CONFLICT(intake_id, payment_id) DO UPDATE SET score=EXCLUDED.score, reasons=EXCLUDED.reasons, updated_at=NOW()`,
        [createId('pmatch'), companyId, environment, intakeId, candidate.payment.id, candidate.score, JSON.stringify(candidate.reasons)],
      );
    }
    return { intake_id: intakeId, matched: suggestions.length > 0, suggestions };
  }

  async confirm(intakeId: string, paymentId: string, companyId: string, environment: FiscalEnvironment) {
    return this.db.withTransaction(async (client) => {
      const intakeResult = await client.query<IntakeRow>(
        'SELECT id, linked_invoice_id FROM document_intakes WHERE id=$1 AND company_id=$2 AND environment=$3 FOR UPDATE',
        [intakeId, companyId, environment],
      );
      const intake = intakeResult.rows[0];
      if (!intake) throw new BadRequestException('Document intake not found');

      const existing = await client.query<MatchRow>(
        `SELECT * FROM document_payment_matches WHERE intake_id=$1 AND company_id=$2 AND environment=$3 AND status='confirmed' FOR UPDATE`,
        [intakeId, companyId, environment],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].payment_id !== paymentId) throw new BadRequestException('Document intake already has another confirmed payment');
        return { match: existing.rows[0], duplicate: true, ledger_recorded: Boolean(intake.linked_invoice_id), financial_evidence_recorded: true };
      }

      const candidate = await client.query<MatchRow>(
        `SELECT * FROM document_payment_matches WHERE intake_id=$1 AND payment_id=$2 AND company_id=$3 AND environment=$4 AND status='suggested' FOR UPDATE`,
        [intakeId, paymentId, companyId, environment],
      );
      if (!candidate.rows[0]) throw new BadRequestException('Suggested payment match not found');

      const paymentResult = await client.query<PaymentRow>(
        'SELECT * FROM payment_records WHERE id=$1 AND company_id=$2 AND environment=$3 FOR UPDATE',
        [paymentId, companyId, environment],
      );
      const payment = paymentResult.rows[0];
      if (!payment) throw new BadRequestException('Payment record not found');

      const confirmed = await client.query<MatchRow>(
        `UPDATE document_payment_matches SET status='confirmed', confirmed_at=NOW(), updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [candidate.rows[0].id],
      );
      await client.query(
        `UPDATE document_payment_matches SET status='rejected', updated_at=NOW()
         WHERE intake_id=$1 AND payment_id<>$2 AND company_id=$3 AND environment=$4 AND status='suggested'`,
        [intakeId, paymentId, companyId, environment],
      );

      await client.query(
        `INSERT INTO tax_position_financial_evidence(
           id, company_id, environment, evidence_type, intake_id, payment_id, match_id, invoice_id,
           effective_at, amount, currency, payload
         ) VALUES($1,$2,$3,'payment_confirmation',$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
         ON CONFLICT(match_id) DO NOTHING`,
        [
          createId('tpe'), companyId, environment, intakeId, paymentId, confirmed.rows[0].id,
          intake.linked_invoice_id ?? null, payment.occurred_at, Number(payment.amount), payment.currency ?? 'BRL',
          JSON.stringify({
            score: Number(confirmed.rows[0].score),
            reasons: confirmed.rows[0].reasons,
            reconciliation: 'human-confirmed',
            tax_effect_applied: false,
          }),
        ],
      );

      let ledgerRecorded = false;
      if (intake.linked_invoice_id) {
        await client.query(
          `INSERT INTO ledger_entries(invoice_id, event_type, payload)
           VALUES($1,'payment.match.confirmed',$2::jsonb)`,
          [intake.linked_invoice_id, JSON.stringify({
            intake_id: intakeId,
            payment_id: paymentId,
            match_id: confirmed.rows[0].id,
            score: Number(confirmed.rows[0].score),
            reasons: confirmed.rows[0].reasons,
            payment,
            reconciliation: 'human-confirmed',
            tax_effect_applied: false,
          })],
        );
        ledgerRecorded = true;
      }
      return { match: confirmed.rows[0], duplicate: false, ledger_recorded: ledgerRecorded, financial_evidence_recorded: true };
    });
  }

  async paymentStatus(intakeId: string, companyId: string, environment: FiscalEnvironment) {
    const intakeResult = await this.db.query<IntakeRow>(
      'SELECT id, linked_invoice_id FROM document_intakes WHERE id=$1 AND company_id=$2 AND environment=$3',
      [intakeId, companyId, environment],
    );
    if (!intakeResult.rows[0]) throw new BadRequestException('Document intake not found');
    const { rows } = await this.db.query<any>(
      `SELECT m.id AS match_id, m.score, m.reasons, m.confirmed_at,
              p.id AS payment_id, p.external_id, p.direction, p.amount, p.currency, p.occurred_at,
              p.counterparty_tax_id, p.counterparty_name, p.reference,
              e.id AS evidence_id
       FROM document_payment_matches m
       JOIN payment_records p ON p.id=m.payment_id
       LEFT JOIN tax_position_financial_evidence e ON e.match_id=m.id
       WHERE m.intake_id=$1 AND m.company_id=$2 AND m.environment=$3 AND m.status='confirmed'
       LIMIT 1`,
      [intakeId, companyId, environment],
    );
    const confirmed = rows[0];
    return {
      intake_id: intakeId,
      invoice_id: intakeResult.rows[0].linked_invoice_id ?? undefined,
      paid: Boolean(confirmed),
      reconciliation_status: confirmed ? 'confirmed' : 'unconfirmed',
      financial_evidence_id: confirmed?.evidence_id ?? undefined,
      payment: confirmed ? {
        id: confirmed.payment_id,
        external_id: confirmed.external_id ?? undefined,
        direction: confirmed.direction,
        amount: Number(confirmed.amount),
        currency: confirmed.currency,
        occurred_at: confirmed.occurred_at,
        counterparty_tax_id: confirmed.counterparty_tax_id ?? undefined,
        counterparty_name: confirmed.counterparty_name ?? undefined,
        reference: confirmed.reference ?? undefined,
      } : undefined,
      match: confirmed ? {
        id: confirmed.match_id,
        score: Number(confirmed.score),
        reasons: confirmed.reasons,
        confirmed_at: confirmed.confirmed_at,
      } : undefined,
      tax_effect_applied: false,
      warning: confirmed
        ? 'Confirmed payment is financial evidence only; it does not create IBS/CBS credits, debits or assessment effects automatically.'
        : 'No payment has been explicitly confirmed for this fiscal document.',
    };
  }

  private digits(value?: string | null): string | null {
    const normalized = String(value ?? '').replace(/\D/g, '');
    return normalized || null;
  }
}
