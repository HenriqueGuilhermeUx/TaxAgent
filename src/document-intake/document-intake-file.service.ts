import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { JobsService } from '../jobs/jobs.service';
import { EncryptedEnvelope, EnvelopeCryptoService } from '../security/envelope-crypto.service';
import { AzureDocumentOcrService } from './azure-document-ocr.service';
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
  status: 'stored' | 'extracted' | 'awaiting_ocr' | 'ocr_processing' | 'failed';
  intake_id: string | null;
  error_message: string | null;
  ocr_provider: string | null;
  ocr_job_id: string | null;
  ocr_operation_url: string | null;
  ocr_metadata: Record<string, unknown> | null;
  ocr_started_at: Date | null;
  ocr_completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class DocumentIntakeFileService {
  constructor(
    private readonly db: DatabaseService,
    private readonly crypto: EnvelopeCryptoService,
    private readonly intake: DocumentIntakeService,
    private readonly ocr: AzureDocumentOcrService,
    private readonly jobs: JobsService,
  ) {}

  async upload(file: IntakeUploadedFile | undefined, companyId: string, environment: FiscalEnvironment, documentType = 'auto') {
    if (!file?.buffer?.length) throw new BadRequestException('Select a document file');
    const maxBytes = Math.max(1024, Number(process.env.TAXAGENT_DOCUMENT_UPLOAD_MAX_BYTES ?? 10 * 1024 * 1024));
    if (file.buffer.length > maxBytes) throw new BadRequestException(`Document exceeds maximum size of ${maxBytes} bytes`);

    const filename = String(file.originalname ?? 'document').slice(0, 255);
    const contentType = String(file.mimetype ?? 'application/octet-stream').toLowerCase();
    if (!this.isAllowed(contentType, filename)) throw new BadRequestException('Supported document types: PDF, PNG, JPEG, XML and plain text');

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const id = createId('ifile');
    const sealed = this.crypto.seal(file.buffer);
    const initialStatus = this.canExtractDirectly(contentType, filename) ? 'stored' : 'awaiting_ocr';
    const { rows } = await this.db.query<FileRecord>(
      `INSERT INTO document_intake_files(id, company_id, environment, filename, content_type, size_bytes, sha256, encrypted_content, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
       ON CONFLICT(company_id, environment, sha256) DO NOTHING RETURNING *`,
      [id, companyId, environment, filename, contentType, file.buffer.length, sha256, JSON.stringify(sealed), initialStatus],
    );
    let record = rows[0];
    let duplicate = false;
    if (!record) {
      duplicate = true;
      const existing = await this.db.query<FileRecord>('SELECT * FROM document_intake_files WHERE company_id=$1 AND environment=$2 AND sha256=$3', [companyId, environment, sha256]);
      record = existing.rows[0];
    }
    if (!record) throw new Error('Document file persistence failed');

    if (!record.intake_id && this.canExtractDirectly(record.content_type, record.filename)) {
      try {
        const content = this.crypto.open(record.encrypted_content).toString('utf8');
        const sourceType = this.isXml(record.content_type, record.filename) ? 'xml' : 'text';
        const extracted = await this.intake.extract(
          { source_type: sourceType, content, document_type: documentType as any, provider: 'auto', persist: true },
          companyId,
          environment,
        );
        if (!('intake_id' in extracted)) throw new Error('Persisted document extraction did not return intake_id');
        const updated = await this.db.query<FileRecord>(
          `UPDATE document_intake_files SET status='extracted', intake_id=$2, error_message=NULL, updated_at=NOW() WHERE id=$1 RETURNING *`,
          [record.id, extracted.intake_id],
        );
        record = updated.rows[0] ?? record;
      } catch (error) {
        record = await this.markFailed(record.id, error);
      }
    } else if (!duplicate && !record.intake_id && record.status === 'awaiting_ocr' && this.ocr.enabled()) {
      await this.jobs.enqueue('document_ocr', {
        fileId: record.id,
        companyId,
        environment,
        documentType,
        phase: 'start',
      });
    }
    return this.toPublic(record, duplicate);
  }

  async get(fileId: string, companyId: string, environment: FiscalEnvironment) {
    return this.toPublic(await this.requireRecord(fileId, companyId, environment), false);
  }

  async startOcr(fileId: string, companyId: string, environment: FiscalEnvironment) {
    let record = await this.requireRecord(fileId, companyId, environment);
    if (record.intake_id) return this.toPublic(record, true);
    if (this.canExtractDirectly(record.content_type, record.filename)) throw new BadRequestException('XML/TXT files do not require OCR');
    if (record.status === 'ocr_processing' && record.ocr_operation_url) return this.toPublic(record, true);

    try {
      const content = this.crypto.open(record.encrypted_content);
      const started = await this.ocr.start(content);
      const { rows } = await this.db.query<FileRecord>(
        `UPDATE document_intake_files
         SET status='ocr_processing', ocr_provider=$2, ocr_job_id=$3, ocr_operation_url=$4,
             ocr_metadata=$5::jsonb, ocr_started_at=NOW(), ocr_completed_at=NULL, error_message=NULL, updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [record.id, started.provider, started.job_id, started.operation_url, JSON.stringify({ api_version: started.api_version, model_id: started.model_id })],
      );
      record = rows[0] ?? record;
      return this.toPublic(record, false);
    } catch (error) {
      record = await this.markFailed(record.id, error);
      throw error;
    }
  }

  async pollOcr(fileId: string, companyId: string, environment: FiscalEnvironment, documentType = 'auto') {
    let record = await this.requireRecord(fileId, companyId, environment);
    if (record.intake_id) return this.toPublic(record, true);
    if (record.status !== 'ocr_processing' || !record.ocr_operation_url) throw new BadRequestException('OCR has not been started for this document file');

    try {
      const result = await this.ocr.poll(record.ocr_operation_url);
      if (result.status === 'running') {
        const { rows } = await this.db.query<FileRecord>(
          `UPDATE document_intake_files SET ocr_metadata=$2::jsonb, updated_at=NOW() WHERE id=$1 RETURNING *`,
          [record.id, JSON.stringify({ ...(record.ocr_metadata ?? {}), ...(result.metadata ?? {}), status: 'running' })],
        );
        return this.toPublic(rows[0] ?? record, false);
      }
      if (result.status === 'failed' || !result.text) {
        const { rows } = await this.db.query<FileRecord>(
          `UPDATE document_intake_files SET status='failed', error_message=$2, ocr_metadata=$3::jsonb, ocr_completed_at=NOW(), updated_at=NOW() WHERE id=$1 RETURNING *`,
          [record.id, String(result.error ?? 'OCR failed').slice(0, 1000), JSON.stringify({ ...(record.ocr_metadata ?? {}), ...(result.metadata ?? {}), status: 'failed' })],
        );
        return this.toPublic(rows[0] ?? record, false);
      }

      const extracted = await this.intake.extract(
        {
          source_type: 'text',
          content: result.text,
          document_type: documentType as any,
          provider: 'native',
          persist: true,
          source_provenance: {
            provider: 'azure_document_intelligence',
            method: 'prebuilt-read',
            metadata: {
              source_file_id: record.id,
              source_file_sha256: record.sha256,
              source_content_type: record.content_type,
              ocr_job_id: record.ocr_job_id,
              ...(result.metadata ?? {}),
            },
          },
        },
        companyId,
        environment,
      );
      if (!('intake_id' in extracted)) throw new Error('Persisted OCR extraction did not return intake_id');
      const { rows } = await this.db.query<FileRecord>(
        `UPDATE document_intake_files
         SET status='extracted', intake_id=$2, error_message=NULL, ocr_metadata=$3::jsonb, ocr_completed_at=NOW(), updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [record.id, extracted.intake_id, JSON.stringify({ ...(record.ocr_metadata ?? {}), ...(result.metadata ?? {}), status: 'succeeded' })],
      );
      record = rows[0] ?? record;
      return this.toPublic(record, false);
    } catch (error) {
      record = await this.markFailed(record.id, error, true);
      throw error;
    }
  }

  async submitExtractedText(fileId: string, text: string, companyId: string, environment: FiscalEnvironment, documentType = 'auto') {
    if (!text?.trim()) throw new BadRequestException('Extracted text is required');
    const record = await this.requireRecord(fileId, companyId, environment);
    if (record.intake_id) return this.toPublic(record, true);

    const extracted = await this.intake.extract(
      {
        source_type: 'text',
        content: text,
        document_type: documentType as any,
        provider: 'native',
        persist: true,
        source_provenance: {
          provider: 'manual_extracted_text',
          method: 'operator-supplied',
          metadata: { source_file_id: record.id, source_file_sha256: record.sha256, source_content_type: record.content_type },
        },
      },
      companyId,
      environment,
    );
    if (!('intake_id' in extracted)) throw new Error('Persisted document extraction did not return intake_id');
    const updated = await this.db.query<FileRecord>(
      `UPDATE document_intake_files SET status='extracted', intake_id=$2, error_message=NULL, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [record.id, extracted.intake_id],
    );
    return this.toPublic(updated.rows[0] ?? record, false);
  }

  private async requireRecord(fileId: string, companyId: string, environment: FiscalEnvironment): Promise<FileRecord> {
    const { rows } = await this.db.query<FileRecord>('SELECT * FROM document_intake_files WHERE id=$1', [fileId]);
    const record = rows[0];
    if (!record || record.company_id !== companyId || record.environment !== environment) throw new BadRequestException('Document file not found for this company/environment');
    return record;
  }

  private async markFailed(fileId: string, error: unknown, ocrCompleted = false): Promise<FileRecord> {
    const message = error instanceof Error ? error.message : 'Document extraction failed';
    const { rows } = await this.db.query<FileRecord>(
      `UPDATE document_intake_files SET status='failed', error_message=$2,
       ocr_completed_at=CASE WHEN $3::boolean THEN NOW() ELSE ocr_completed_at END, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [fileId, message.slice(0, 1000), ocrCompleted],
    );
    return rows[0];
  }

  private isAllowed(contentType: string, filename: string): boolean {
    return this.canExtractDirectly(contentType, filename) || contentType === 'application/pdf' || contentType === 'image/png' || contentType === 'image/jpeg' || /\.(pdf|png|jpe?g)$/i.test(filename);
  }

  private canExtractDirectly(contentType: string, filename: string): boolean {
    return this.isXml(contentType, filename) || contentType.startsWith('text/plain') || /\.txt$/i.test(filename);
  }

  private isXml(contentType: string, filename: string): boolean {
    return contentType.includes('xml') || /\.xml$/i.test(filename);
  }

  private toPublic(record: FileRecord, duplicate: boolean) {
    const nextAction = record.status === 'awaiting_ocr'
      ? (this.ocr.enabled() ? 'automatic OCR queued; check this file again or use the explicit OCR endpoint' : 'submit extracted text to /v1/documents/intake/files/:fileId/extracted-text')
      : record.status === 'ocr_processing'
        ? 'automatic OCR processing; check this file again or poll explicitly'
        : undefined;
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
      extraction_required: record.status === 'awaiting_ocr' || record.status === 'ocr_processing',
      ocr: record.ocr_provider ? {
        provider: record.ocr_provider,
        job_id: record.ocr_job_id ?? undefined,
        metadata: record.ocr_metadata ?? undefined,
        started_at: record.ocr_started_at ?? undefined,
        completed_at: record.ocr_completed_at ?? undefined,
      } : undefined,
      next_action: nextAction,
      error_message: record.error_message ?? undefined,
      duplicate,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }
}
