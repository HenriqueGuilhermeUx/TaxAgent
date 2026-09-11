import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FiscalInboxModule } from '../inbox/fiscal-inbox.module';
import { JobsModule } from '../jobs/jobs.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AzureDocumentOcrService } from './azure-document-ocr.service';
import { DocStructExtractorService } from './docstruct-extractor.service';
import { DocumentIntakeController } from './document-intake.controller';
import { DocumentIntakeFileService } from './document-intake-file.service';
import { DocumentIntakeService } from './document-intake.service';
import { DocumentOcrWorkerService } from './document-ocr-worker.service';
import { NativeDocumentExtractorService } from './native-document-extractor.service';
import { PaymentMatchingService } from './payment-matching.service';
import { ReconciliationCasesService } from './reconciliation-cases.service';

@Module({
  imports: [AuthModule, FiscalInboxModule, JobsModule, WebhooksModule],
  controllers: [DocumentIntakeController],
  providers: [DocumentIntakeService, DocumentIntakeFileService, NativeDocumentExtractorService, DocStructExtractorService, AzureDocumentOcrService, DocumentOcrWorkerService, PaymentMatchingService, ReconciliationCasesService],
  exports: [DocumentIntakeService, DocumentIntakeFileService, AzureDocumentOcrService, PaymentMatchingService, ReconciliationCasesService],
})
export class DocumentIntakeModule {}
