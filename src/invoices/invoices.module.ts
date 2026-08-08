import { Module } from '@nestjs/common';
import { FiscalRouterService } from '../fiscal-core/fiscal-router.service';
import { FiscalLedgerService } from '../ledger/fiscal-ledger.service';
import { NfseNationalProvider } from '../providers/nfse-national/nfse-national.provider';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    FiscalRouterService,
    FiscalLedgerService,
    TaxEngineService,
    NfseNationalProvider,
  ],
})
export class InvoicesModule {}
