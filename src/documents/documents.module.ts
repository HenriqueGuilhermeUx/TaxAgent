import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FiscalDocumentsController } from './fiscal-documents.controller';
import { FiscalDocumentsService } from './fiscal-documents.service';

@Module({
  imports: [AuthModule],
  controllers: [FiscalDocumentsController],
  providers: [FiscalDocumentsService],
  exports: [FiscalDocumentsService],
})
export class DocumentsModule {}
