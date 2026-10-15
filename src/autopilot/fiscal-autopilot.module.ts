import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomersModule } from '../customers/customers.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { OperationsModule } from '../operations/operations.module';
import { PreparedDpsModule } from '../prepared-dps/prepared-dps.module';
import { TaxEngineModule } from '../tax-engine/tax-engine.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { FiscalAutopilotController } from './fiscal-autopilot.controller';
import { FiscalAutopilotService } from './fiscal-autopilot.service';

@Module({
  imports: [AuthModule, TenancyModule, CustomersModule, TaxEngineModule, PreparedDpsModule, OperationsModule, InvoicesModule],
  controllers: [FiscalAutopilotController],
  providers: [FiscalAutopilotService],
  exports: [FiscalAutopilotService],
})
export class FiscalAutopilotModule {}
