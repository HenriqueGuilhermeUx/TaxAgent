import { Module } from '@nestjs/common';
import { PublicRtc2026SimulatorController } from './public-rtc-2026-simulator.controller';
import { PublicRtc2026SimulatorService } from './public-rtc-2026-simulator.service';

@Module({
  controllers: [PublicRtc2026SimulatorController],
  providers: [PublicRtc2026SimulatorService],
})
export class PublicSimulatorModule {}
