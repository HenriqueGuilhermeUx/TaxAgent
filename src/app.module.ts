import { Module } from '@nestjs/common';
import { FiscalAutopilotModule } from './autopilot/fiscal-autopilot.module';
import { AuthModule } from './auth/auth.module';
import { CertificatesModule } from './certificates/certificates.module';
import { CustomersModule } from './customers/customers.module';
import { DanfseModule } from './danfse/danfse.module';
import { DatabaseModule } from './database/database.module';
import { DocumentIntakeModule } from './document-intake/document-intake.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthModule } from './health/health.module';
import { HomologationConsoleModule } from './homologation-console/homologation-console.module';
import { FiscalInboxModule } from './inbox/fiscal-inbox.module';
import { InvoicesModule } from './invoices/invoices.module';
import { MunicipalParametersModule } from './municipal-parameters/municipal-parameters.module';
import { OperationsModule } from './operations/operations.module';
import { SchemaRegistryModule } from './schema-registry/schema-registry.module';
import { SecurityModule } from './security/security.module';
import { TaxEngineModule } from './tax-engine/tax-engine.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({ imports: [SecurityModule, DatabaseModule, AuthModule, HealthModule, HomologationConsoleModule, TenancyModule, CustomersModule, CertificatesModule, SchemaRegistryModule, MunicipalParametersModule, OperationsModule, DocumentsModule, DocumentIntakeModule, WebhooksModule, FiscalInboxModule, DanfseModule, TaxEngineModule, InvoicesModule, FiscalAutopilotModule] })
export class AppModule {}
