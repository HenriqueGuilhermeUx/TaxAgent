import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TaxEngineModule } from '../tax-engine/tax-engine.module';
import { OfficialRtcClient } from './official-rtc.client';
import { OfficialRtcController } from './official-rtc.controller';
import { CanonicalRtcController } from './canonical-rtc.controller';
import { CanonicalRtcService } from './canonical-rtc.service';
import { OfficialRtcService } from './official-rtc.service';
import { SimulatorBatchController } from './simulator-batch.controller';
import { SimulatorBatchService } from './simulator-batch.service';
import { RtcBatchService } from './rtc-batch.service';

@Module({
  imports: [AuthModule, TaxEngineModule],
  controllers: [OfficialRtcController, CanonicalRtcController, SimulatorBatchController],
  providers: [OfficialRtcClient, OfficialRtcService, CanonicalRtcService, SimulatorBatchService, RtcBatchService],
  exports: [OfficialRtcClient, OfficialRtcService],
})
export class OfficialRtcModule {}
