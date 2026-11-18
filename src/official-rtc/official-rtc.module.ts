import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OfficialRtcClient } from './official-rtc.client';
import { OfficialRtcController } from './official-rtc.controller';
import { OfficialRtcService } from './official-rtc.service';

@Module({
  imports: [AuthModule],
  controllers: [OfficialRtcController],
  providers: [OfficialRtcClient, OfficialRtcService],
  exports: [OfficialRtcClient, OfficialRtcService],
})
export class OfficialRtcModule {}
