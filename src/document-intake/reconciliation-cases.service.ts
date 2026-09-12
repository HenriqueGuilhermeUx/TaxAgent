import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { WebhooksService } from '../webhooks/webhooks.service';

export type ReconciliationCaseStatus = 'open' | 'investigating' | 'resolved' | 'ignored';

type CaseRow = {
  id: string;
  company_id: string;
  environment: FiscalEnvironment;
  fingerprint: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  status: ReconciliationCaseStatus;
  intake_id: string | null;
  payment_id: string | null;
  invoice_id: string | null;
  external_reference: string | null;
  details: any;
  resolution_code: string | null;
  resolution_note: string | null;
  occurrence_count: number;
  detected_at: Date;
  last_seen_at: Date;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class ReconciliationCasesService {
  constructor(private readonly db: DatabaseService, private readonly webhooks: WebhooksService) {}

  async sync(companyId: string, environment: FiscalEnvironment, issues: any[]) {
    let opened = 0;
    let reopened = 0;
    let refreshed = 0;
    const caseIds: string[] = [];

    for (const issue of issues) {
      const subject = issue.intake_id ?? issue.payment_id ?? issue.external_id;
      if (!subject) continue;
      const fingerprint = `${issue.type}:${subject}`;
      const existing = await this.db.query<CaseRow>(
        'SELECT * FROM reconciliation_cases WHERE company_id=$1 AND environment=$2 AND fingerprint=$3',
        [companyId, environment, fingerprint],
      );

      const invoiceId = issue.intake_id ? await this.invoiceForIntake(issue.intake_id, companyId, environment) : null;
      if (!existing.rows[0]) {
        const id = createId('rcase');
        await this.db.withTransaction(async (client) => {
          await client.query(
            `INSERT INTO reconciliation_cases(id, company_id, environment, fingerprint, type, severity, status, intake_id, payment_id, invoice_id, external_reference, details)
             VALUES($1,$2,$3,$4,$5,$6,'open',$7,$8,$9,$10,$11::jsonb)`,
            [id, companyId, environment, fingerprint, issue.type, issue.severity ?? 'medium', issue.intake_id ?? null, issue.payment_id ?? null, invoiceId, issue.external_id ?? null, JSON.stringify(issue)],
          );
          await client.query(
            `INSERT INTO reconciliation_case_events(id, case_id, company_id, event_type, to_status, payload)
             VALUES($1,$2,$3,'detected','open',$4::jsonb)`,
            [createId('rcevt'), id, companyId, JSON.stringify({ issue })],
          );
          if (invoiceId) await this.writeLedger(client, invoiceId, 'reconciliation.case.opened', { case_id: id, issue, tax_effect_applied: false });
        });
        opened += 1;
        caseIds.push(id);
        await this.webhooks.emit(companyId, 'reconciliation.case.opened', { case_id: id, environment, issue, tax_effect_applied: false });
        continue;
      }

      const current = existing.rows[0];
      const shouldReopen = current.status === 'resolved' || current.status === 'ignored';
      await this.db.withTransaction(async (client) => {
        await client.query(
          `UPDATE reconciliation_cases
           SET severity=$2, details=$3::jsonb, invoice_id=COALESCE($4, invoice_id), last_seen_at=NOW(), occurrence_count=occurrence_count+1,
               status=CASE WHEN status IN ('resolved','ignored') THEN 'open' ELSE status END,
               resolved_at=CASE WHEN status IN ('resolved','ignored') THEN NULL ELSE resolved_at END,
               resolution_code=CASE WHEN status IN ('resolved','ignored') THEN NULL ELSE resolution_code END,
               resolution_note=CASE WHEN status IN ('resolved','ignored') THEN NULL ELSE resolution_note END,
               updated_at=NOW()
           WHERE id=$1`,
          [current.id, issue.severity ?? current.severity, JSON.stringify(issue), invoiceId],
        );
        await client.query(
          `INSERT INTO reconciliation_case_events(id, case_id, company_id, event_type, from_status, to_status, payload)
           VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
          [createId('rcevt'), current.id, companyId, shouldReopen ? 'reopened' : 'seen_again', current.status, shouldReopen ? 'open' : current.status, JSON.stringify({ issue })],
        );
        if (shouldReopen && (invoiceId ?? current.invoice_id)) await this.writeLedger(client, invoiceId ?? current.invoice_id!, 'reconciliation.case.reopened', { case_id: current.id, issue, tax_effect_applied: false });
      });
      if (shouldReopen) {
        reopened += 1;
        await this.webhooks.emit(companyId, 'reconciliation.case.reopened', { case_id: current.id, environment, issue, tax_effect_applied: false });
      } else refreshed += 1;
      caseIds.push(current.id);
    }

    return { company_id: companyId, environment, issues_received: issues.length, cases_opened: opened, cases_reopened: reopened, cases_refreshed: refreshed, case_ids: caseIds };
  }

  async list(companyId: string, environment: FiscalEnvironment, status?: string, severity?: string) {
    const statuses = status ? status.split(',').map((v) => v.trim()).filter(Boolean) : [];
    const severities = severity ? severity.split(',').map((v) => v.trim()).filter(Boolean) : [];
    const { rows } = await this.db.query<CaseRow>(
      `SELECT * FROM reconciliation_cases
       WHERE company_id=$1 AND environment=$2
         AND (cardinality($3::text[]) = 0 OR status = ANY($3::text[]))
         AND (cardinality($4::text[]) = 0 OR severity = ANY($4::text[]))
       ORDER BY CASE severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, last_seen_at DESC`,
      [companyId, environment, statuses, severities],
    );
    return { company_id: companyId, environment, count: rows.length, cases: rows };
  }

  async get(caseId: string, companyId: string, environment: FiscalEnvironment) {
    const { rows } = await this.db.query<CaseRow>('SELECT * FROM reconciliation_cases WHERE id=$1 AND company_id=$2 AND environment=$3', [caseId, companyId, environment]);
    if (!rows[0]) throw new NotFoundException('Reconciliation case not found');
    const events = await this.db.query('SELECT * FROM reconciliation_case_events WHERE case_id=$1 AND company_id=$2 ORDER BY created_at ASC', [caseId, companyId]);
    return { ...rows[0], events: events.rows };
  }

  async transition(caseId: string, companyId: string, environment: FiscalEnvironment, toStatus: ReconciliationCaseStatus, resolutionCode?: string, note?: string) {
    if (!['open', 'investigating', 'resolved', 'ignored'].includes(toStatus)) throw new BadRequestException('Invalid reconciliation case status');
    if ((toStatus === 'resolved' || toStatus === 'ignored') && !String(note ?? '').trim()) throw new BadRequestException('A note is required to resolve or ignore a reconciliation case');

    const result = await this.db.withTransaction(async (client) => {
      const currentResult = await client.query<CaseRow>('SELECT * FROM reconciliation_cases WHERE id=$1 AND company_id=$2 AND environment=$3 FOR UPDATE', [caseId, companyId, environment]);
      const current = currentResult.rows[0];
      if (!current) throw new NotFoundException('Reconciliation case not found');
      this.assertTransition(current.status, toStatus);
      if (current.status === toStatus) return { case: current, duplicate: true };

      const updated = await client.query<CaseRow>(
        `UPDATE reconciliation_cases SET status=$2, resolution_code=$3, resolution_note=$4,
             resolved_at=CASE WHEN $2 IN ('resolved','ignored') THEN NOW() ELSE NULL END, updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [caseId, toStatus, resolutionCode ?? null, note?.trim() || null],
      );
      await client.query(
        `INSERT INTO reconciliation_case_events(id, case_id, company_id, event_type, from_status, to_status, note, payload)
         VALUES($1,$2,$3,'status_changed',$4,$5,$6,$7::jsonb)`,
        [createId('rcevt'), caseId, companyId, current.status, toStatus, note?.trim() || null, JSON.stringify({ resolution_code: resolutionCode ?? null, tax_effect_applied: false })],
      );
      if (current.invoice_id) await this.writeLedger(client, current.invoice_id, `reconciliation.case.${toStatus}`, { case_id: caseId, from_status: current.status, to_status: toStatus, resolution_code: resolutionCode ?? null, note: note?.trim() || null, tax_effect_applied: false });
      return { case: updated.rows[0], duplicate: false };
    });

    if (!result.duplicate) await this.webhooks.emit(companyId, `reconciliation.case.${toStatus}`, { case: result.case, tax_effect_applied: false });
    return result;
  }

  private assertTransition(from: ReconciliationCaseStatus, to: ReconciliationCaseStatus) {
    const allowed: Record<ReconciliationCaseStatus, ReconciliationCaseStatus[]> = {
      open: ['open', 'investigating', 'resolved', 'ignored'],
      investigating: ['investigating', 'open', 'resolved', 'ignored'],
      resolved: ['resolved', 'open'],
      ignored: ['ignored', 'open'],
    };
    if (!allowed[from].includes(to)) throw new BadRequestException(`Cannot transition reconciliation case from ${from} to ${to}`);
  }

  private async invoiceForIntake(intakeId: string, companyId: string, environment: FiscalEnvironment): Promise<string | null> {
    const { rows } = await this.db.query<{ linked_invoice_id: string | null }>('SELECT linked_invoice_id FROM document_intakes WHERE id=$1 AND company_id=$2 AND environment=$3', [intakeId, companyId, environment]);
    return rows[0]?.linked_invoice_id ?? null;
  }

  private async writeLedger(client: any, invoiceId: string, eventType: string, payload: unknown) {
    await client.query('INSERT INTO ledger_entries(invoice_id, event_type, payload) VALUES($1,$2,$3::jsonb)', [invoiceId, eventType, JSON.stringify(payload)]);
  }
}
