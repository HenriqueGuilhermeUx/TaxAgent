import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CertificatesModule } from './certificates/certificates.module';
import { DanfseModule } from './danfse/danfse.module';
import { DatabaseModule } from './database/database.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthModule } from './health/health.module';
import { FiscalInboxModule } from './inbox/fiscal-inbox.module';
import { InvoicesModule } from './invoices/invoices.module';
import { MunicipalParametersModule } from './municipal-parameters/municipal-parameters.module';
import { SchemaRegistryModule } from './schema-registry/schema-registry.module';
import { SecurityModule } from './security/security.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({ imports: [SecurityModule, DatabaseModule, AuthModule, HealthModule, TenancyModule, CertificatesModule, SchemaRegistryModule, MunicipalParametersModule, DocumentsModule, WebhooksModule, FiscalInboxModule, DanfseModule, InvoicesModule] })
export class AppModule {}
