import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { MunicipalParametersClient } from './municipal-parameters.client';

@ApiTags('municipal-parameters')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('municipalities')
export class MunicipalParametersController {
  constructor(private readonly client: MunicipalParametersClient) {}

  @Get(':cityCode/convention')
  getConvention(@Param('cityCode') cityCode: string, @Query('environment') environment: FiscalEnvironment = 'test') {
    return this.client.getConvention(environment, cityCode);
  }
}
