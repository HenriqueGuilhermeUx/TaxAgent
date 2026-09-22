import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RequireScope } from '../auth/require-scope.decorator';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { MunicipalCapabilityService } from './municipal-capability.service';
import { MunicipalParametersClient } from './municipal-parameters.client';

@ApiTags('municipal-parameters') @ApiBearerAuth() @UseGuards(ApiKeyGuard) @RequireScope('parameters:read') @Controller('municipalities')
export class MunicipalParametersController {
  constructor(
    private readonly client: MunicipalParametersClient,
    private readonly capabilities: MunicipalCapabilityService,
  ) {}

  @Get(':cityCode/convention')
  getConvention(@Param('cityCode') cityCode: string, @Query('environment') environment: FiscalEnvironment = 'test') {
    return this.client.getConvention(environment, cityCode);
  }

  @Get(':cityCode/capabilities')
  getCapabilities(@Param('cityCode') cityCode: string, @Query('environment') environment: FiscalEnvironment = 'test', @Query('tax_regime') taxRegime?: string, @Query('effective_at') effectiveAt?: string) {
    return this.capabilities.resolve(cityCode, environment, { taxRegime, effectiveAt });
  }
}
