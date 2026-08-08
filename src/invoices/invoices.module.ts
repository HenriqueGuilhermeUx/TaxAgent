import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { FiscalRouterService } from '../fiscal-core/fiscal-router.service';
import { JobsModule } from '../jobs/jobs.module';
import { FiscalLedgerService } from '../ledger/fiscal-ledger.service';
import { NfseNationalClient } from '../providers/nfse-national/nfse-national.client';
import { NfseNationalProvider } from '../providers/nfse-national/nfse-national.provider';
import { SchemaRegistryModule } from '../schema-registry/schema-registry.module';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import { TenancyModule } from '../tenancy/tenancy.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { XmlEngineModule } from '../xml-engine/xml-engine.module';
import { InvoiceWorkerService } from './invoice-worker.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesRepository } from './invoices.repository';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [AuthModule, JobsModule, TenancyModule, CertificatesModule, SchemaRegistryModule, XmlEngineModule, WebhooksModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesRepository, InvoiceWorkerService, FiscalRouterService, FiscalLedgerService, TaxEngineService, NfseNationalClient, NfseNationalProvider],
})
export class InvoicesModule {}
