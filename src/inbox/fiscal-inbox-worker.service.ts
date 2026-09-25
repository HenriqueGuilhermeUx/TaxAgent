import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { JobsService } from '../jobs/jobs.service';
import { FiscalInboxService } from './fiscal-inbox.service';

@Injectable()
export class FiscalInboxWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FiscalInboxWorkerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private readonly jobs: JobsService, private readonly inbox: FiscalInboxService) {}
  onModuleInit() { const interval = Number(process.env.TAXAGENT_JOB_POLL_MS ?? 1000); this.timer = setInterval(() => void this.tick(), interval); this.timer.unref(); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const job = await this.jobs.claim<{ companyId: string; environment: FiscalEnvironment; cnpjConsulta?: string }>('sync_fiscal_inbox');
      if (!job) return;
      try { await this.inbox.syncOneBatch(job.payload.companyId, job.payload.environment, job.payload.cnpjConsulta); await this.jobs.complete(job.id); }
      catch (error) { this.logger.warn(`Inbox sync ${job.id} failed: ${error instanceof Error ? error.message : String(error)}`); await this.jobs.retryOrFail(job.id, job.attempts, error); }
    } finally { this.running = false; }
  }
}
