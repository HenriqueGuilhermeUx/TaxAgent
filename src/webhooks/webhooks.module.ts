import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JobsModule } from '../jobs/jobs.module';
import { WebhookSecurityService } from './webhook-security.service';
import { WebhookWorkerService } from './webhook-worker.service';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [AuthModule, JobsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookSecurityService, WebhookWorkerService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
