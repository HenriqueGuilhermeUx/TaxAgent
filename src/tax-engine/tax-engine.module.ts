import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RtcOpenDataClient } from './rtc-open-data.client';
import { TaxDomainRegistryService } from './tax-domain-registry.service';
import { TaxEngineController } from './tax-engine.controller';
import { TaxEngineService } from './tax-engine.service';

@Module({
  imports: [AuthModule],
  controllers: [TaxEngineController],
  providers: [RtcOpenDataClient, TaxDomainRegistryService, TaxEngineService],
  exports: [TaxEngineService, RtcOpenDataClient, TaxDomainRegistryService],
})
export class TaxEngineModule {}
