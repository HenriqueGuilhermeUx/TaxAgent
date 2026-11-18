import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RequireScope } from '../auth/require-scope.decorator';
import { OfficialRtcService } from './official-rtc.service';
import { CanonicalRegularCalculationDto, CanonicalSimplesCalculationDto } from './canonical-rtc.dto';
import { mapCanonicalRegular, mapCanonicalSimples } from './canonical-rtc.mapper';

@ApiTags('rtc-canonical')
@Controller('rtc/canonical')
export class CanonicalRtcController {
  constructor(private readonly rtc: OfficialRtcService) {}

  @Post('regular/calculate')
  @ApiBearerAuth()
  @UseGuards(ApiKeyGuard)
  @RequireScope('tax:resolve')
  @ApiOperation({ summary: 'Calculate regular-regime RTC from the stable TaxAgent canonical contract' })
  calculateRegular(@Body() dto: CanonicalRegularCalculationDto) {
    return this.rtc.calculate('regular', mapCanonicalRegular(dto));
  }

  @Post('simples/calculate')
  @ApiBearerAuth()
  @UseGuards(ApiKeyGuard)
  @RequireScope('tax:resolve')
  @ApiOperation({ summary: 'Calculate Simples Nacional RTC from the stable TaxAgent canonical contract' })
  calculateSimples(@Body() dto: CanonicalSimplesCalculationDto) {
    return this.rtc.calculate('simples', mapCanonicalSimples(dto));
  }
}
