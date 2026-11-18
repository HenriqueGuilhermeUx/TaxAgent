import { Body, Controller, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { RequireScope } from '../auth/require-scope.decorator';
import { CanonicalRtcService } from './canonical-rtc.service';
import { CanonicalRegularCalculationDto, CanonicalSimplesCalculationDto } from './canonical-rtc.dto';

@ApiTags('rtc-canonical')
@Controller('rtc/canonical')
export class CanonicalRtcController {
  constructor(private readonly rtc: CanonicalRtcService) {}

  @Post('regular/calculate')
  @ApiBearerAuth()
  @UseGuards(ApiKeyGuard)
  @RequireScope('tax:resolve')
  @ApiOperation({ summary: 'Calculate regular-regime RTC from the stable TaxAgent canonical contract' })
  calculateRegular(@Body() dto: CanonicalRegularCalculationDto, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    if (!auth?.companyId) throw new UnauthorizedException('Authenticated company context required');
    return this.rtc.calculateRegular(auth.companyId, dto);
  }

  @Post('simples/calculate')
  @ApiBearerAuth()
  @UseGuards(ApiKeyGuard)
  @RequireScope('tax:resolve')
  @ApiOperation({ summary: 'Calculate Simples Nacional RTC from the stable TaxAgent canonical contract' })
  calculateSimples(@Body() dto: CanonicalSimplesCalculationDto, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    if (!auth?.companyId) throw new UnauthorizedException('Authenticated company context required');
    return this.rtc.calculateSimples(auth.companyId, dto);
  }
}
