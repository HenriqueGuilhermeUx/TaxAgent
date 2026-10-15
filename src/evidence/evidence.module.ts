import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NexOfficePartnerGuard } from '../customer-portal/nexoffice-partner.guard';
import { TenancyModule } from '../tenancy/tenancy.module';
import { DocWalletEvidenceClient } from './docwallet-evidence.client';
import { DocumentEvidenceService } from './document-evidence.service';
import { EvidenceController, RegulatoryChangesController } from './evidence.controller';
import { EvidencePortalPageController } from './evidence-portal.controller';
import { NexOfficeEvidenceController } from './nexoffice-evidence.controller';

@Module({
  imports: [AuthModule, TenancyModule],
  controllers: [EvidencePortalPageController, EvidenceController, RegulatoryChangesController, NexOfficeEvidenceController],
  providers: [DocWalletEvidenceClient, DocumentEvidenceService, NexOfficePartnerGuard],
  exports: [DocWalletEvidenceClient, DocumentEvidenceService],
})
export class EvidenceModule {}
