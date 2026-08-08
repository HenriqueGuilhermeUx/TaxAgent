import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CertificateVaultService } from '../certificates/certificate-vault.service';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { JobsService } from '../jobs/jobs.service';
import { TenancyService } from '../tenancy/tenancy.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { AdnContributorsClient } from './adn-contributors.client';
import { decodeAdnDocument, extractAdnEntries } from './adn-document.decoder';

interface InboxCursor { last_nsu: string; backoff_until: Date | null }

@Injectable()
export class FiscalInboxService {
  constructor(
    private readonly db: DatabaseService,
    private readonly tenancy: TenancyService,
    private readonly vault: CertificateVaultService,
    private readonly adn: AdnContributorsClient,
    private readonly jobs: JobsService,
    private readonly webhooks: WebhooksService,
  ) {}

  async requestSync(companyId: string, environment: FiscalEnvironment, cnpjConsulta?: string) {
    await this.tenancy.getCompany(companyId);
    const id = await this.jobs.enqueue('sync_fiscal_inbox', { companyId, environment, cnpjConsulta });
    return { job_id: id, status: 'queued', company_id: companyId, environment };
  }

  async syncOneBatch(companyId: string, environment: FiscalEnvironment, cnpjConsulta?: string) {
    await this.tenancy.getCompany(companyId);
    const cursor = await this.getCursor(companyId, environment);
    if (cursor.backoff_until && cursor.backoff_until.getTime() > Date.now()) {
      return { status: 'backoff', company_id: companyId, environment, last_nsu: cursor.last_nsu, backoff_until: cursor.backoff_until };
    }

    const requestedNsu = (BigInt(cursor.last_nsu) + 1n).toString();
    const certificate = await this.vault.getActiveMaterial(companyId);
    const response = await this.adn.getDfe(environment, requestedNsu, certificate, cnpjConsulta);
    const entries = extractAdnEntries(response);
    let maxNsu = BigInt(cursor.last_nsu);
    let inserted = 0;

    for (const entry of entries) {
      const document = decodeAdnDocument(entry);
      if (!document) continue;
      const nsu = BigInt(document.nsu);
      if (nsu > maxNsu) maxNsu = nsu;
      const id = createId('inbox');
      const sha256 = document.content ? createHash('sha256').update(document.content).digest('hex') : null;
      const result = await this.db.query(
        `INSERT INTO inbox_documents(id, company_id, environment, nsu, access_key, document_type, event_type, generated_at, sha256, content, content_type, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
         ON CONFLICT(company_id, environment, nsu) DO NOTHING
         RETURNING id`,
        [id, companyId, environment, document.nsu, document.accessKey ?? null, document.documentType ?? null, document.eventType ?? null, document.generatedAt ?? null, sha256, document.content ?? null, document.contentType ?? null, JSON.stringify(document.metadata)],
      );
      if (result.rowCount) {
        inserted += 1;
        await this.webhooks.emit(companyId, 'inbox.document.received', { document_id: id, nsu: document.nsu, access_key: document.accessKey, document_type: document.documentType, event_type: document.eventType });
      }
    }

    const status = this.readStatus(response);
    if (!entries.length) {
      const minutes = Math.max(1, Number(process.env.TAXAGENT_INBOX_IDLE_BACKOFF_MINUTES ?? 60));
      await this.db.query(
        `UPDATE inbox_cursors SET last_sync_at=NOW(), backoff_until=NOW()+($3 || ' minutes')::interval, last_status=$4, updated_at=NOW()
         WHERE company_id=$1 AND environment=$2`,
        [companyId, environment, String(minutes), status],
      );
      return { status: 'idle', company_id: companyId, environment, requested_nsu: requestedNsu, last_nsu: cursor.last_nsu, inserted, backoff_minutes: minutes, adn_status: status };
    }

    await this.db.query(
      `UPDATE inbox_cursors SET last_nsu=$3, last_sync_at=NOW(), backoff_until=NULL, last_status=$4, updated_at=NOW()
       WHERE company_id=$1 AND environment=$2`,
      [companyId, environment, maxNsu.toString(), status],
    );
    return { status: 'synced', company_id: companyId, environment, requested_nsu: requestedNsu, last_nsu: maxNsu.toString(), received: entries.length, inserted, adn_status: status };
  }

  async list(companyId: string, environment: FiscalEnvironment, limit = 50) {
    const safeLimit = Math.min(200, Math.max(1, limit));
    const { rows } = await this.db.query(
      `SELECT id, nsu::text, access_key, document_type, event_type, generated_at, sha256, content_type, octet_length(content) AS bytes, received_at
       FROM inbox_documents WHERE company_id=$1 AND environment=$2 ORDER BY nsu DESC LIMIT $3`,
      [companyId, environment, safeLimit],
    );
    return rows;
  }

  async getContent(companyId: string, documentId: string) {
    const { rows } = await this.db.query<{ company_id: string; content: Buffer | null; content_type: string | null; sha256: string | null; document_type: string | null }>(
      'SELECT company_id, content, content_type, sha256, document_type FROM inbox_documents WHERE id=$1', [documentId],
    );
    const document = rows[0];
    if (!document) throw new NotFoundException('Inbox document not found');
    if (document.company_id !== companyId) throw new ForbiddenException('Inbox document belongs to another company');
    if (!document.content) throw new NotFoundException('Inbox document has no decoded content; inspect metadata/raw ADN response semantics');
    return document;
  }

  async getEvents(companyId: string, environment: FiscalEnvironment, accessKey: string) {
    await this.tenancy.getCompany(companyId);
    const certificate = await this.vault.getActiveMaterial(companyId);
    return this.adn.getEvents(environment, accessKey, certificate);
  }

  private async getCursor(companyId: string, environment: FiscalEnvironment): Promise<InboxCursor> {
    await this.db.query(
      `INSERT INTO inbox_cursors(company_id, environment, last_nsu) VALUES ($1,$2,0)
       ON CONFLICT(company_id, environment) DO NOTHING`,
      [companyId, environment],
    );
    const { rows } = await this.db.query<InboxCursor>('SELECT last_nsu::text, backoff_until FROM inbox_cursors WHERE company_id=$1 AND environment=$2', [companyId, environment]);
    return rows[0];
  }

  private readStatus(response: unknown): string | null {
    if (!response || typeof response !== 'object') return null;
    const value = (response as Record<string, unknown>).StatusProcessamento ?? (response as Record<string, unknown>).statusProcessamento;
    return value === undefined || value === null ? null : String(value);
  }
}
