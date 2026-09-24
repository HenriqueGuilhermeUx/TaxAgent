import { BadRequestException, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { RequireScope } from '../auth/require-scope.decorator';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { FiscalOnboardingPreflightService } from './fiscal-onboarding-preflight.service';
import { FiscalOnboardingService } from './fiscal-onboarding.service';

@ApiTags('operations')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('operations/onboarding')
export class FiscalOnboardingController {
  constructor(
    private readonly onboarding: FiscalOnboardingService,
    private readonly preflight: FiscalOnboardingPreflightService,
  ) {}

  @Get(':companyId')
  @RequireScope('operations:read')
  @ApiOperation({ summary: 'Resolve company fiscal onboarding, routing and missing requirements without transmitting any fiscal document' })
  @ApiQuery({ name: 'environment', required: false, enum: ['test', 'production'], example: 'test' })
  @ApiQuery({ name: 'effective_at', required: false, example: '2026-09-24' })
  inspect(
    @Param('companyId') companyId: string,
    @Query('environment') rawEnvironment: string | undefined,
    @Query('effective_at') effectiveAt: string | undefined,
    @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext,
  ) {
    const environment = this.environment(rawEnvironment ?? auth?.environment ?? 'test');
    this.assertAccess(companyId, environment, auth);
    return this.onboarding.inspect(companyId, environment, effectiveAt);
  }

  @Post(':companyId/preflight')
  @RequireScope('operations:read')
  @ApiOperation({ summary: 'Run the resolved provider preflight using only safe non-emitting network methods' })
  @ApiQuery({ name: 'environment', required: false, enum: ['test', 'production'], example: 'test' })
  @ApiQuery({ name: 'effective_at', required: false, example: '2026-09-24' })
  runPreflight(
    @Param('companyId') companyId: string,
    @Query('environment') rawEnvironment: string | undefined,
    @Query('effective_at') effectiveAt: string | undefined,
    @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext,
  ) {
    const environment = this.environment(rawEnvironment ?? auth?.environment ?? 'test');
    this.assertAccess(companyId, environment, auth);
    return this.preflight.run(companyId, environment, effectiveAt);
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
