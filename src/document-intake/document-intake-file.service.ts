import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { EncryptedEnvelope, EnvelopeCryptoService } from '../security/envelope-crypto.service';
import { DocumentIntakeService } from './document-intake.service';

export type IntakeUploadedFile = {
  buffer?: Buffer;
  originalname?: string;
  size?: number;
  mimetype?: string;
};

interface FileRecord {
  id: string;
  company_id: string;
  environment: FiscalEnvironment;
  filename: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  encrypted_content: EncryptedEnvelope;
  status: 'stored' | 'extracted' | 'awaiting_ocr' | 'failed';
  intake_id: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class DocumentIntakeFileService {
  constructor(
    private readonly db: DatabaseService,
    private readonly crypto: EnvelopeCryptoService,
    private readonly intake: DocumentIntakeService,
  ) {}

  async upload(file: IntakeUploadedFile | undefined, companyId: string, environment: FiscalEnvironment, documentType = 'auto') {
    if (!file?.buffer?.length) throw new BadRequestException('Select a document file');
    const maxBytes = Math.max(1024, Number(process.env.TAXAGENT_DOCUMENT_UPLOAD_MAX_BYTES ?? 10 * 1024 * 1024));
    if (file.buffer.length > maxBytes) throw new BadRequestException(`Document exceeds maximum size of ${maxBytes} bytes`);

    const filename = String(file.originalname ?? 'document').slice(0, 255);
    const contentType = String(file.mimetype ?? 'application/octet-stream').toLowerCase();
    const allowed = this.isAllowed(contentType, filename);
    if (!allowed) throw new BadRequestException('Supported document types: PDF, PNG, JPEG, XML and plain text');

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const id = createId('ifile');
    const sealed = this.crypto.seal(file.buffer);
    const initialStatus = this.canExtractDirectly(contentType, filename) ? 'stored' : 'awaiting_ocr';
    const { rows } = await this.db.query<FileRecord>(
      `INSERT INTO document_intake_files(id, company_id, environment, filename, content_type, size_bytes, sha256, encrypted_content, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
       ON CONFLICT(company_id, environment, sha256) DO NOTHING
       RETURNING *`,
      [id, companyId, environment, filename, contentType, file.buffer.length, sha256, JSON.stringify(sealed), initialStatus],
    );
    let record = rows[0];
    let duplicate = false;
    if (!record) {
      duplicate = true;
      const existing = await this.db.query<FileRecord>(
        'SELECT * FROM document_intake_files WHERE company_id=$1 AND environment=$2 AND sha256=$3',
        [companyId, environment, sha256],
      );
      record = existing.rows[0];
    }
    if (!record) throw new Error('Document file persistence failed');

    if (!record.intake_id && this.canExtractDirectly(record.content_type, record.filename)) {
      try {
        const content = this.crypto.open(record.encrypted_content).toString('utf8');
        const sourceType = this.isXml(record.content_type, record.filename) ? 'xml' : 'text';
        const extracted = await this.intake.extract(
          { source_type: sourceType, content, document_type: documentType as any, provider: 'auto' },
          companyId,
          environment,
        );
        const updated = await this.db.query<FileRecord>(
          `UPDATE document_intake_files SET status='extracted', intake_id=$2, updated_at=NOW() WHERE id=$1 RETURNING *`,
          [record.id, extracted.intake_id],
        );
        record = updated.rows[0] ?? record;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Document extraction failed';
        const updated = await this.db.query<FileRecord>(
          `UPDATE document_intake_files SET status='failed', error_message=$2, updated_at=NOW() WHERE id=$1 RETURNING *`,
          [record.id, message.slice(0, 1000)],
        );
        record = updated.rows[0] ?? record;
      }
    }

    return this.toPublic(record, duplicate);
  }

  async get(fileId: string, companyId: string, environment: FiscalEnvironment) {
    const { rows } = await this.db.query<FileRecord>('SELECT * FROM document_intake_files WHERE id=$1', [fileId]);
    const record = rows[0];
    if (!record || record.company_id !== companyId || record.environment !== environment) {
      throw new BadRequestException('Document file not found for this company/environment');
    }
    return this.toPublic(record, false);
  }

  async submitExtractedText(fileId: string, text: string, companyId: string, environment: FiscalEnvironment, documentType = 'auto') {
    if (!text?.trim()) throw new BadRequestException('Extracted text is required');
    const { rows } = await this.db.query<FileRecord>('SELECT * FROM document_intake_files WHERE id=$1', [fileId]);
    const record = rows[0];
    if (!record || record.company_id !== companyId || record.environment !== environment) {
      throw new BadRequestException('Document file not found for this company/environment');
    }
    if (record.intake_id) return this.toPublic(record, true);

    const extracted = await this.intake.extract(
      { source_type: 'text', content: text, document_type: documentType as any, provider: 'auto' },
      companyId,
      environment,
    );
    const updated = await this.db.query<FileRecord>(
      `UPDATE document_intake_files SET status='extracted', intake_id=$2, error_message=NULL, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [record.id, extracted.intake_id],
    );
    return this.toPublic(updated.rows[0] ?? record, false);
  }

  private isAllowed(contentType: string, filename: string): boolean {
    return this.canExtractDirectly(contentType, filename)
      || contentType === 'application/pdf'
      || contentType === 'image/png'
      || contentType === 'image/jpeg'
      || /\.(pdf|png|jpe?g)$/i.test(filename);
  }

  private canExtractDirectly(contentType: string, filename: string): boolean {
    return this.isXml(contentType, filename)
      || contentType.startsWith('text/plain')
      || /\.txt$/i.test(filename);
  }

  private isXml(contentType: string, filename: string): boolean {
    return contentType.includes('xml') || /\.xml$/i.test(filename);
  }

  private toPublic(record: FileRecord, duplicate: boolean) {
    return {
      file_id: record.id,
      company_id: record.company_id,
      environment: record.environment,
      filename: record.filename,
      content_type: record.content_type,
      size_bytes: record.size_bytes,
      sha256: record.sha256,
      status: record.status,
      intake_id: record.intake_id ?? undefined,
      extraction_required: record.status === 'awaiting_ocr',
      next_action: record.status === 'awaiting_ocr' ? 'submit extracted text to /v1/documents/intake/files/:fileId/extracted-text' : undefined,
      error_message: record.error_message ?? undefined,
      duplicate,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }
}
