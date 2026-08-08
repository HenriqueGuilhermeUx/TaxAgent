import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class FiscalDocumentsService {
  constructor(private readonly db: DatabaseService) {}
  async save(input: { invoiceId: string; kind: string; content: Buffer | string; contentType: string; metadata?: unknown }) {
    const id = createId('doc'); const content = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content, 'utf8'); const sha256 = createHash('sha256').update(content).digest('hex');
    await this.db.query(`INSERT INTO fiscal_documents(id, invoice_id, kind, sha256, content, content_type, content_encoding, metadata) VALUES ($1,$2,$3,$4,$5,$6,'identity',$7::jsonb)`, [id, input.invoiceId, input.kind, sha256, content, input.contentType, JSON.stringify(input.metadata ?? null)]);
    return { id, kind: input.kind, sha256, bytes: content.length, content_type: input.contentType };
  }
  async list(invoiceId: string, companyId?: string) { await this.assertInvoiceAccess(invoiceId, companyId); const { rows } = await this.db.query(`SELECT id, kind, sha256, content_type, octet_length(content) AS bytes, metadata, created_at FROM fiscal_documents WHERE invoice_id=$1 ORDER BY created_at`, [invoiceId]); return rows; }
  async get(invoiceId: string, documentId: string, companyId?: string) { await this.assertInvoiceAccess(invoiceId, companyId); const { rows } = await this.db.query<{ id: string; kind: string; sha256: string; content_type: string | null; content: Buffer }>('SELECT id, kind, sha256, content_type, content FROM fiscal_documents WHERE id=$1 AND invoice_id=$2', [documentId, invoiceId]); if (!rows[0]) throw new NotFoundException('Fiscal document not found'); return rows[0]; }
  async latestContent(invoiceId: string, kind: string) { const { rows } = await this.db.query<{ id: string; sha256: string; content_type: string | null; content: Buffer }>('SELECT id, sha256, content_type, content FROM fiscal_documents WHERE invoice_id=$1 AND kind=$2 AND content IS NOT NULL ORDER BY created_at DESC LIMIT 1', [invoiceId, kind]); return rows[0] ?? null; }
  private async assertInvoiceAccess(invoiceId: string, companyId?: string) { const { rows } = await this.db.query<{ company_id: string }>('SELECT company_id FROM invoices WHERE id=$1', [invoiceId]); if (!rows[0]) throw new NotFoundException('Invoice not found'); if (companyId && rows[0].company_id !== companyId) throw new ForbiddenException('Invoice belongs to another company'); }
}
