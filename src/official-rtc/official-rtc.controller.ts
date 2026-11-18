import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RequireScope } from '../auth/require-scope.decorator';
import { OfficialRtcService } from './official-rtc.service';

@ApiTags('official-rtc')
@Controller('rtc/official')
export class OfficialRtcController {
  constructor(private readonly rtc: OfficialRtcService) {}

  @Get('status')
  @ApiBearerAuth()
  @UseGuards(ApiKeyGuard)
  @RequireScope('tax:read')
  @ApiOperation({ summary: 'Inspect pinned Receita Federal RTC engines and TaxAgent activation mode' })
  status() { return this.rtc.status(); }

  @Get('freshness')
  @ApiBearerAuth()
  @UseGuards(ApiKeyGuard)
  @RequireScope('tax:read')
  @ApiOperation({ summary: 'Compare pinned open-source RTC release against the current Receita reference version' })
  freshness() { return this.rtc.freshness(); }

  @Post('regular/calculate')
  @ApiBearerAuth()
  @UseGuards(ApiKeyGuard)
  @RequireScope('tax:resolve')
  @ApiOperation({ summary: 'Execute the pinned official regular-regime RTC engine with audit provenance' })
  calculateRegular(@Body() payload: Record<string, unknown>) { return this.rtc.calculate('regular', payload); }

  @Post('simples/calculate')
  @ApiBearerAuth()
  @UseGuards(ApiKeyGuard)
  @RequireScope('tax:resolve')
  @ApiOperation({ summary: 'Execute the pinned official Simples Nacional RTC engine with audit provenance' })
  calculateSimples(@Body() payload: Record<string, unknown>) { return this.rtc.calculate('simples', payload); }
}
