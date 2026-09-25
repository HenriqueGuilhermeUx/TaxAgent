import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { OperationsModule } from '../operations/operations.module';
import { ProviderCredentialsModule } from '../provider-credentials/provider-credentials.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { CustomerFiscalController } from './customer-fiscal.controller';
import { CustomerFiscalService } from './customer-fiscal.service';
import { CustomerPortalPageController } from './customer-portal.controller';
import { NexOfficePartnerController } from './nexoffice-partner.controller';
import { NexOfficePartnerGuard } from './nexoffice-partner.guard';

@Module({
  imports: [AuthModule, OperationsModule, TenancyModule, CertificatesModule, ProviderCredentialsModule, InvoicesModule],
  controllers: [CustomerPortalPageController, CustomerFiscalController, NexOfficePartnerController],
  providers: [CustomerFiscalService, NexOfficePartnerGuard],
})
export class CustomerPortalModule {}
