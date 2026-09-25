import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OperationsModule } from '../operations/operations.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { CustomerFiscalController } from './customer-fiscal.controller';
import { CustomerFiscalService } from './customer-fiscal.service';
import { CustomerPortalPageController } from './customer-portal.controller';

@Module({
  imports: [AuthModule, OperationsModule, TenancyModule],
  controllers: [CustomerPortalPageController, CustomerFiscalController],
  providers: [CustomerFiscalService],
})
export class CustomerPortalModule {}
