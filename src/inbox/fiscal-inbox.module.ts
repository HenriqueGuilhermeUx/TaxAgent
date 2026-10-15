import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { JobsModule } from '../jobs/jobs.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AdnContributorsClient } from './adn-contributors.client';
import { FiscalInboxController } from './fiscal-inbox.controller';
import { FiscalInboxService } from './fiscal-inbox.service';
import { FiscalInboxWorkerService } from './fiscal-inbox-worker.service';

@Module({
  imports: [AuthModule, CertificatesModule, JobsModule, TenancyModule, WebhooksModule],
  controllers: [FiscalInboxController],
  providers: [AdnContributorsClient, FiscalInboxService, FiscalInboxWorkerService],
  exports: [FiscalInboxService],
})
export class FiscalInboxModule {}
