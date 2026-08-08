import { Module } from '@nestjs/common';
import { CertificatesModule } from './certificates/certificates.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { InvoicesModule } from './invoices/invoices.module';
import { SchemaRegistryModule } from './schema-registry/schema-registry.module';
import { TenancyModule } from './tenancy/tenancy.module';

@Module({
  imports: [DatabaseModule, HealthModule, TenancyModule, CertificatesModule, SchemaRegistryModule, InvoicesModule],
})
export class AppModule {}
