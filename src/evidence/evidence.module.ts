import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { DocWalletEvidenceClient } from './docwallet-evidence.client';
import { DocumentEvidenceService } from './document-evidence.service';
import { EvidenceController, RegulatoryChangesController } from './evidence.controller';

@Module({
  imports: [AuthModule, TenancyModule],
  controllers: [EvidenceController, RegulatoryChangesController],
  providers: [DocWalletEvidenceClient, DocumentEvidenceService],
  exports: [DocWalletEvidenceClient, DocumentEvidenceService],
})
export class EvidenceModule {}
