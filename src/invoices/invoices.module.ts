import { Module } from '@nestjs/common';
import { FiscalRouterService } from '../fiscal-core/fiscal-router.service';
import { JobsModule } from '../jobs/jobs.module';
import { FiscalLedgerService } from '../ledger/fiscal-ledger.service';
import { NfseNationalProvider } from '../providers/nfse-national/nfse-national.provider';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import { InvoiceWorkerService } from './invoice-worker.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesRepository } from './invoices.repository';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [JobsModule],
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    InvoicesRepository,
    InvoiceWorkerService,
    FiscalRouterService,
    FiscalLedgerService,
    TaxEngineService,
    NfseNationalProvider,
  ],
})
export class InvoicesModule {}
