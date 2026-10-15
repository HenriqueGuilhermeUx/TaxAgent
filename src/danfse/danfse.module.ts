import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { JobsModule } from '../jobs/jobs.module';
import { DanfseController } from './danfse.controller';
import { DanfseParserService } from './danfse-parser.service';
import { DanfseRendererService } from './danfse-renderer.service';
import { DanfseService } from './danfse.service';
import { DanfseWorkerService } from './danfse-worker.service';

@Module({ imports: [AuthModule, DocumentsModule, JobsModule], controllers: [DanfseController], providers: [DanfseParserService, DanfseRendererService, DanfseService, DanfseWorkerService], exports: [DanfseService] })
export class DanfseModule {}
