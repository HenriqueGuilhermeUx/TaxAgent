import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FiscalInboxModule } from '../inbox/fiscal-inbox.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { DocStructExtractorService } from './docstruct-extractor.service';
import { DocumentIntakeController } from './document-intake.controller';
import { DocumentIntakeFileService } from './document-intake-file.service';
import { DocumentIntakeService } from './document-intake.service';
import { NativeDocumentExtractorService } from './native-document-extractor.service';

@Module({
  imports: [AuthModule, FiscalInboxModule, WebhooksModule],
  controllers: [DocumentIntakeController],
  providers: [DocumentIntakeService, DocumentIntakeFileService, NativeDocumentExtractorService, DocStructExtractorService],
  exports: [DocumentIntakeService, DocumentIntakeFileService],
})
export class DocumentIntakeModule {}
