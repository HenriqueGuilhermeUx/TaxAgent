import { Body, Controller, Header, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicRtc2026SimulationDto } from './public-rtc-2026-simulation.dto';
import { PublicRtc2026SimulatorService } from './public-rtc-2026-simulator.service';

@ApiTags('public')
@Controller('public/simulator')
export class PublicRtc2026SimulatorController {
  constructor(private readonly simulator: PublicRtc2026SimulatorService) {}

  @Post('rtc-2026')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Public, stateless and reference-only 2026 RTC simulator; accepts no taxpayer/customer PII' })
  simulate(@Body() dto: PublicRtc2026SimulationDto) {
    return this.simulator.simulate(dto);
  }
}
