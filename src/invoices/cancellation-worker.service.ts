import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service';
import { InvoicesService } from './invoices.service';

@Injectable()
export class CancellationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CancellationWorkerService.name); private timer?: NodeJS.Timeout; private running = false;
  constructor(private readonly jobs: JobsService, private readonly invoices: InvoicesService) {}
  onModuleInit() { const interval = Number(process.env.TAXAGENT_JOB_POLL_MS ?? 1000); this.timer = setInterval(() => void this.tick(), interval); this.timer.unref(); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  private async tick() {
    if (this.running) return; this.running = true;
    try { const job = await this.jobs.claim<{ invoiceId: string; reasonCode: string; reason: string }>('cancel_invoice'); if (!job) return; try { await this.invoices.processCancellation(job.payload.invoiceId, job.payload.reasonCode, job.payload.reason, job.attempts); await this.jobs.complete(job.id); } catch (error) { this.logger.warn(`Cancellation job ${job.id} failed: ${error instanceof Error ? error.message : String(error)}`); await this.jobs.retryOrFail(job.id, job.attempts, error); } }
    finally { this.running = false; }
  }
}
