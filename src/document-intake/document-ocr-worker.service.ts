import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { DocumentIntakeFileService } from './document-intake-file.service';

type DocumentOcrJob = {
  fileId: string;
  companyId: string;
  environment: FiscalEnvironment;
  documentType?: string;
  phase: 'start' | 'poll';
};

@Injectable()
export class DocumentOcrWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentOcrWorkerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly jobs: JobsService, private readonly files: DocumentIntakeFileService) {}

  onModuleInit() {
    const interval = Math.max(250, Number(process.env.TAXAGENT_JOB_POLL_MS ?? 1000));
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const job = await this.jobs.claim<DocumentOcrJob>('document_ocr');
      if (!job) return;
      try {
        if (job.payload.phase === 'start') {
          const result = await this.files.startOcr(job.payload.fileId, job.payload.companyId, job.payload.environment);
          if (result.status === 'ocr_processing') {
            await this.jobs.enqueue('document_ocr', { ...job.payload, phase: 'poll' }, this.nextPollAt());
          }
        } else {
          const result = await this.files.pollOcr(
            job.payload.fileId,
            job.payload.companyId,
            job.payload.environment,
            job.payload.documentType ?? 'auto',
          );
          if (result.status === 'ocr_processing') {
            await this.jobs.enqueue('document_ocr', { ...job.payload, phase: 'poll' }, this.nextPollAt());
          }
        }
        await this.jobs.complete(job.id);
      } catch (error) {
        this.logger.warn(`Document OCR job ${job.id} failed: ${error instanceof Error ? error.message : String(error)}`);
        await this.jobs.retryOrFail(job.id, job.attempts, error);
      }
    } catch (error) {
      this.logger.error('Document OCR worker tick failed', error instanceof Error ? error.stack : undefined);
    } finally {
      this.running = false;
    }
  }

  private nextPollAt(): Date {
    const delayMs = Math.min(60_000, Math.max(1_000, Number(process.env.TAXAGENT_DOCUMENT_OCR_POLL_MS ?? 3_000)));
    return new Date(Date.now() + delayMs);
  }
}
