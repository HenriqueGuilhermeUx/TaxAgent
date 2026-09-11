import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { FiscalInboxService } from '../inbox/fiscal-inbox.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { DocStructExtractorService } from './docstruct-extractor.service';
import { NativeDocumentExtractorService } from './native-document-extractor.service';
import { CanonicalFiscalDocument, DocumentIntakeApprovalRequest, DocumentIntakeRequest, IntakeProvider } from './document-intake.types';

interface IntakeRecord {
  id: string;
  company_id: string;
  environment: FiscalEnvironment;
  source_type: string;
  provider: string;
  document_type: string;
  authority: string;
  confidence: string | number;
  source_sha256: string;
  canonical_document: CanonicalFiscalDocument;
  provider_metadata: Record<string, unknown> | null;
  status: 'extracted' | 'inbox' | 'approved' | 'posted';
  inbox_document_id: string | null;
  linked_invoice_id: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class DocumentIntakeService {
  constructor(
    private readonly db: DatabaseService,
    private readonly native: NativeDocumentExtractorService,
    private readonly docstruct: DocStructExtractorService,
    private readonly inbox: FiscalInboxService,
    private readonly webhooks: WebhooksService,
  ) {}

  async extract(input: DocumentIntakeRequest, companyId: string, environment: FiscalEnvironment) {
    if (!input?.content?.trim()) throw new BadRequestException('Document content is required');
    const provider = this.resolveProvider(input);
    if (provider === 'docstruct' && input.source_type !== 'text') {
      throw new BadRequestException('DocStruct public extraction adapter currently supports text input only');
    }
    const extracted = provider === 'docstruct' ? await this.docstruct.extract(input) : await this.native.extract(input);
    if (input.persist === false) return { persisted: false, provider: extracted.provider, canonical: extracted.canonical };

    const intakeId = createId('intake');
    const { rows } = await this.db.query<IntakeRecord>(
      `INSERT INTO document_intakes(id, company_id, environment, source_type, provider, document_type, authority, confidence, source_sha256, canonical_document, provider_metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb)
       ON CONFLICT(company_id, environment, source_sha256) DO NOTHING
       RETURNING *`,
      [intakeId, companyId, environment, input.source_type, extracted.provider, extracted.canonical.document_type, extracted.canonical.authority, extracted.canonical.confidence, extracted.canonical.raw.sha256, JSON.stringify(extracted.canonical), JSON.stringify(extracted.provider_metadata ?? null)],
    );
    let record = rows[0];
    let duplicate = false;
    if (!record) {
      duplicate = true;
      const existing = await this.db.query<IntakeRecord>(
        'SELECT * FROM document_intakes WHERE company_id=$1 AND environment=$2 AND source_sha256=$3',
        [companyId, environment, extracted.canonical.raw.sha256],
      );
      record = existing.rows[0];
    }
    if (!record) throw new Error('Document intake persistence failed');

    const sendToInbox = input.send_to_inbox !== false;
    if (sendToInbox && !record.inbox_document_id) {
      const inbox = await this.inbox.ingestExternal(companyId, environment, {
        sourceReference: record.id,
        documentType: extracted.canonical.document_type,
        generatedAt: extracted.canonical.issued_at,
        sha256: extracted.canonical.raw.sha256,
        content: input.content,
        contentType: input.source_type === 'xml' ? 'application/xml' : 'text/plain; charset=utf-8',
        metadata: { intake_id: record.id, provider: extracted.provider, canonical: extracted.canonical },
      });
      const updated = await this.db.query<IntakeRecord>(
        `UPDATE document_intakes SET inbox_document_id=$2, status=CASE WHEN status='extracted' THEN 'inbox' ELSE status END, updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [record.id, inbox.id],
      );
      record = updated.rows[0] ?? record;
    }

    if (!duplicate) {
      await this.webhooks.emit(companyId, 'document-intake.extracted', {
        intake_id: record.id,
        provider: record.provider,
        authority: record.authority,
        confidence: Number(record.confidence),
        document_type: record.document_type,
        inbox_document_id: record.inbox_document_id,
      });
    }
    return this.toPublic(record, duplicate);
  }

  async get(intakeId: string, companyId: string, environment: FiscalEnvironment) {
    const record = await this.requireRecord(intakeId, companyId, environment);
    return this.toPublic(record, false);
  }

  async approveAndPost(intakeId: string, companyId: string, environment: FiscalEnvironment, body: DocumentIntakeApprovalRequest) {
    if (body?.confirmation !== 'APPROVE-DOCUMENT-INTAKE') {
      throw new BadRequestException('Explicit confirmation APPROVE-DOCUMENT-INTAKE is required');
    }
    if (!body.invoice_id) throw new BadRequestException('invoice_id is required to post a document intake to the Fiscal Ledger');

    const result = await this.db.withTransaction(async (client) => {
      const intakeResult = await client.query<IntakeRecord>('SELECT * FROM document_intakes WHERE id=$1 FOR UPDATE', [intakeId]);
      const intake = intakeResult.rows[0];
      if (!intake) throw new NotFoundException('Document intake not found');
      if (intake.company_id !== companyId) throw new ForbiddenException('Document intake belongs to another company');
      if (intake.environment !== environment) throw new ForbiddenException('Document intake environment does not match API key environment');
      if (intake.status === 'posted') {
        if (intake.linked_invoice_id !== body.invoice_id) throw new BadRequestException('Document intake is already posted to another invoice');
        return { record: intake, duplicate: true };
      }

      const invoiceResult = await client.query<{ id: string; company_id: string; environment: FiscalEnvironment }>(
        'SELECT id, company_id, environment FROM invoices WHERE id=$1',
        [body.invoice_id],
      );
      const invoice = invoiceResult.rows[0];
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.company_id !== companyId) throw new ForbiddenException('Invoice belongs to another company');
      if (invoice.environment !== environment) throw new ForbiddenException('Invoice environment does not match document intake environment');

      await client.query(
        `INSERT INTO ledger_entries(invoice_id, event_type, payload)
         VALUES ($1,'document-intake.posted',$2::jsonb)`,
        [invoice.id, JSON.stringify({
          intake_id: intake.id,
          inbox_document_id: intake.inbox_document_id,
          source_sha256: intake.source_sha256,
          provider: intake.provider,
          authority: intake.authority,
          confidence: Number(intake.confidence),
          canonical_document: intake.canonical_document,
          approval: 'explicit',
        })],
      );
      const update = await client.query<IntakeRecord>(
        `UPDATE document_intakes SET status='posted', linked_invoice_id=$2, updated_at=NOW() WHERE id=$1 RETURNING *`,
        [intake.id, invoice.id],
      );
      return { record: update.rows[0], duplicate: false };
    });

    if (!result.duplicate) {
      await this.webhooks.emit(companyId, 'document-intake.posted', {
        intake_id: result.record.id,
        invoice_id: result.record.linked_invoice_id,
        inbox_document_id: result.record.inbox_document_id,
        authority: result.record.authority,
        confidence: Number(result.record.confidence),
      });
    }
    return { ...this.toPublic(result.record, result.duplicate), ledger_posted: true };
  }

  private resolveProvider(input: DocumentIntakeRequest): Exclude<IntakeProvider, 'auto'> {
    const requested = input.provider ?? (process.env.TAXAGENT_DOCUMENT_INTAKE_PROVIDER as IntakeProvider | undefined) ?? 'native';
    if (!['auto', 'native', 'docstruct'].includes(requested)) throw new BadRequestException(`Unsupported document intake provider: ${requested}`);
    if (requested === 'docstruct') {
      if (process.env.DOCSTRUCT_ENABLED !== 'true') throw new BadRequestException('DocStruct provider is disabled; set DOCSTRUCT_ENABLED=true explicitly');
      return 'docstruct';
    }
    if (requested === 'auto' && input.source_type === 'text' && process.env.DOCSTRUCT_ENABLED === 'true') return 'docstruct';
    return 'native';
  }

  private async requireRecord(intakeId: string, companyId: string, environment: FiscalEnvironment): Promise<IntakeRecord> {
    const { rows } = await this.db.query<IntakeRecord>('SELECT * FROM document_intakes WHERE id=$1', [intakeId]);
    const record = rows[0];
    if (!record) throw new NotFoundException('Document intake not found');
    if (record.company_id !== companyId) throw new ForbiddenException('Document intake belongs to another company');
    if (record.environment !== environment) throw new ForbiddenException('Document intake environment does not match API key environment');
    return record;
  }

  private toPublic(record: IntakeRecord, duplicate: boolean) {
    return {
      intake_id: record.id,
      company_id: record.company_id,
      environment: record.environment,
      status: record.status,
      provider: record.provider,
      authority: record.authority,
      confidence: Number(record.confidence),
      source_sha256: record.source_sha256,
      canonical: record.canonical_document,
      inbox_document_id: record.inbox_document_id ?? undefined,
      linked_invoice_id: record.linked_invoice_id ?? undefined,
      duplicate,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }
}
