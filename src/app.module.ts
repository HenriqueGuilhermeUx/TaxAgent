import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { InvoicesModule } from './invoices/invoices.module';

@Module({
  imports: [HealthModule, InvoicesModule],
})
export class AppModule {}
