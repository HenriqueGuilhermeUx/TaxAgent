import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service';
import { WebhooksService } from './webhooks.service';

@Injectable()
export class WebhookWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookWorkerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly jobs: JobsService, private readonly webhooks: WebhooksService) {}

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
      const job = await this.jobs.claim<{ deliveryId: string }>('deliver_webhook');
      if (!job) return;
      try {
        await this.webhooks.deliver(job.payload.deliveryId);
        await this.jobs.complete(job.id);
      } catch (error) {
        this.logger.warn(`Webhook job ${job.id} failed: ${error instanceof Error ? error.message : String(error)}`);
        await this.jobs.retryOrFail(job.id, job.attempts, error);
      }
    } catch (error) {
      this.logger.error('Webhook worker tick failed', error instanceof Error ? error.stack : undefined);
    } finally {
      this.running = false;
    }
  }
}
