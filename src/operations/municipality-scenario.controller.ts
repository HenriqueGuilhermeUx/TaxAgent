import { BadRequestException, Controller, ForbiddenException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { RequireScope } from '../auth/require-scope.decorator';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { MunicipalityScenarioService } from './municipality-scenario.service';

@ApiTags('operations')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('operations/scenario/municipality')
export class MunicipalityScenarioController {
  constructor(private readonly scenarios: MunicipalityScenarioService) {}

  @Post(':companyId/probe')
  @RequireScope('operations:read')
  @ApiOperation({ summary: 'Reuse the company A1 to probe a service municipality without changing issuer or transmitting a fiscal document' })
  probe(
    @Param('companyId') companyId: string,
    @Query('environment') rawEnvironment: string | undefined,
    @Query('serviceCityCode') serviceCityCode: string | undefined,
    @Query('effectiveAt') effectiveAt: string | undefined,
    @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext,
  ) {
    const environment = this.environment(rawEnvironment ?? auth?.environment ?? 'test');
    this.assertAccess(companyId, environment, auth);
    if (!serviceCityCode) throw new BadRequestException('serviceCityCode is required');
    return this.scenarios.probeServiceMunicipality(companyId, environment, serviceCityCode, effectiveAt);
  }

  private environment(value: string): FiscalEnvironment {
    if (value !== 'test' && value !== 'production') throw new BadRequestException('environment must be test or production');
    return value;
  }

  private assertAccess(companyId: string, environment: FiscalEnvironment, auth?: TaxAgentAuthContext) {
    if (!auth) return;
    if (auth.companyId !== companyId) throw new ForbiddenException('API key cannot inspect another company');
    if (auth.environment !== environment) throw new ForbiddenException('API key environment does not match requested environment');
  }
}
