import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service';
import { InvoicesService } from './invoices.service';

@Injectable()
export class InvoiceWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InvoiceWorkerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly jobs: JobsService, private readonly invoices: InvoicesService) {}

  onModuleInit() {
    const interval = Number(process.env.TAXAGENT_JOB_POLL_MS ?? 1000);
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
      const job = await this.jobs.claim<{ invoiceId: string }>('issue_invoice');
      if (!job) return;
      try {
        await this.invoices.process(job.payload.invoiceId, job.attempts);
        await this.jobs.complete(job.id);
      } catch (error) {
        this.logger.error(`Invoice job ${job.id} failed`, error instanceof Error ? error.stack : undefined);
        await this.jobs.retryOrFail(job.id, job.attempts, error);
      }
    } catch (error) {
      this.logger.error('Invoice worker tick failed', error instanceof Error ? error.stack : undefined);
    } finally {
      this.running = false;
    }
  }
}
