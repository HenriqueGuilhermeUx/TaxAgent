import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TaxEngineModule } from '../tax-engine/tax-engine.module';
import { OfficialRtcClient } from './official-rtc.client';
import { OfficialRtcController } from './official-rtc.controller';
import { OfficialRtcService } from './official-rtc.service';

@Module({
  imports: [AuthModule, TaxEngineModule],
  controllers: [OfficialRtcController],
  providers: [OfficialRtcClient, OfficialRtcService],
  exports: [OfficialRtcClient, OfficialRtcService],
})
export class OfficialRtcModule {}
