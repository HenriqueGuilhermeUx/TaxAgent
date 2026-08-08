import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CertificatesModule } from './certificates/certificates.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { InvoicesModule } from './invoices/invoices.module';
import { SchemaRegistryModule } from './schema-registry/schema-registry.module';
import { SecurityModule } from './security/security.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [SecurityModule, DatabaseModule, AuthModule, HealthModule, TenancyModule, CertificatesModule, SchemaRegistryModule, WebhooksModule, InvoicesModule],
})
export class AppModule {}
