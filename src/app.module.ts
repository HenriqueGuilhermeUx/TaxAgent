import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { InvoicesModule } from './invoices/invoices.module';
import { TenancyModule } from './tenancy/tenancy.module';

@Module({
  imports: [DatabaseModule, HealthModule, TenancyModule, InvoicesModule],
})
export class AppModule {}
