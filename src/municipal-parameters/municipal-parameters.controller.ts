import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RequireScope } from '../auth/require-scope.decorator';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { MetropolitanCoverageService } from './metropolitan-coverage.service';
import { MunicipalCapabilityService } from './municipal-capability.service';
import { MunicipalParametersClient } from './municipal-parameters.client';

@ApiTags('municipal-parameters') @ApiBearerAuth() @UseGuards(ApiKeyGuard) @RequireScope('parameters:read') @Controller('municipalities')
export class MunicipalParametersController {
  constructor(
    private readonly client: MunicipalParametersClient,
    private readonly capabilities: MunicipalCapabilityService,
    private readonly metroCoverage: MetropolitanCoverageService,
  ) {}

  @Get('metros')
  listMetropolitanRegions() {
    return this.metroCoverage.listRegions();
  }

  @Get('metros/:metro/coverage')
  @ApiQuery({ name: 'environment', required: false, enum: ['test', 'production'], example: 'production' })
  @ApiQuery({ name: 'tax_regime', required: false, example: 'regular' })
  @ApiQuery({ name: 'effective_at', required: false, example: '2026-09-24' })
  getMetropolitanCoverage(
    @Param('metro') metro: string,
    @Query('environment') environment: FiscalEnvironment = 'production',
    @Query('tax_regime') taxRegime?: string,
    @Query('effective_at') effectiveAt?: string,
  ) {
    return this.metroCoverage.inspect(metro, environment, taxRegime, effectiveAt);
  }

  @Get(':cityCode/convention')
  getConvention(@Param('cityCode') cityCode: string, @Query('environment') environment: FiscalEnvironment = 'test') {
    return this.client.getConvention(environment, cityCode);
  }

  @Get(':cityCode/capabilities')
  getCapabilities(@Param('cityCode') cityCode: string, @Query('environment') environment: FiscalEnvironment = 'test', @Query('tax_regime') taxRegime?: string, @Query('effective_at') effectiveAt?: string) {
    return this.capabilities.resolve(cityCode, environment, { taxRegime, effectiveAt });
  }
}
