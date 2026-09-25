import { BadRequestException, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { RequireScope } from '../auth/require-scope.decorator';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { FiscalOnboardingAuditService } from './fiscal-onboarding-audit.service';
import { FiscalOnboardingPreflightService } from './fiscal-onboarding-preflight.service';
import { FiscalOnboardingService } from './fiscal-onboarding.service';
import { PilotOnboardingService } from './pilot-onboarding.service';

@ApiTags('operations')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('operations/onboarding')
export class FiscalOnboardingController {
  constructor(
    private readonly onboarding: FiscalOnboardingService,
    private readonly preflight: FiscalOnboardingPreflightService,
    private readonly audit: FiscalOnboardingAuditService,
    private readonly pilot: PilotOnboardingService,
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

  @Get(':companyId/pilot')
  @RequireScope('operations:read')
  @ApiOperation({ summary: 'Return the complete pilot onboarding journey, evidence and next action without transmitting fiscal documents' })
  @ApiQuery({ name: 'environment', required: false, enum: ['test', 'production'], example: 'test' })
  @ApiQuery({ name: 'effective_at', required: false, example: '2026-09-25' })
  pilotStatus(
    @Param('companyId') companyId: string,
    @Query('environment') rawEnvironment: string | undefined,
    @Query('effective_at') effectiveAt: string | undefined,
    @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext,
  ) {
    const environment = this.environment(rawEnvironment ?? auth?.environment ?? 'test');
    this.assertAccess(companyId, environment, auth);
    return this.pilot.status(companyId, environment, effectiveAt);
  }

  @Post(':companyId/pilot/run')
  @RequireScope('operations:read')
  @ApiOperation({ summary: 'Run assessment and, only when locally ready, the safe non-emitting provider preflight; persist immutable evidence for both' })
  @ApiQuery({ name: 'environment', required: false, enum: ['test', 'production'], example: 'test' })
  @ApiQuery({ name: 'effective_at', required: false, example: '2026-09-25' })
  pilotRun(
    @Param('companyId') companyId: string,
    @Query('environment') rawEnvironment: string | undefined,
    @Query('effective_at') effectiveAt: string | undefined,
    @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext,
  ) {
    const environment = this.environment(rawEnvironment ?? auth?.environment ?? 'test');
    this.assertAccess(companyId, environment, auth);
    return this.pilot.run(companyId, environment, effectiveAt);
  }

  @Post(':companyId/assess')
  @RequireScope('operations:read')
  @ApiOperation({ summary: 'Create an immutable onboarding assessment attestation without fiscal transmission' })
  @ApiQuery({ name: 'environment', required: false, enum: ['test', 'production'], example: 'test' })
  @ApiQuery({ name: 'effective_at', required: false, example: '2026-09-24' })
  async assess(
    @Param('companyId') companyId: string,
    @Query('environment') rawEnvironment: string | undefined,
    @Query('effective_at') effectiveAt: string | undefined,
    @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext,
  ) {
    const environment = this.environment(rawEnvironment ?? auth?.environment ?? 'test');
    this.assertAccess(companyId, environment, auth);
    const result = await this.onboarding.inspect(companyId, environment, effectiveAt);
    const attestation = await this.audit.record(companyId, 'onboarding', result);
    return { ...result, attestation };
  }

  @Post(':companyId/preflight')
  @RequireScope('operations:read')
  @ApiOperation({ summary: 'Run the resolved provider preflight using only safe non-emitting network methods and persist its attestation' })
  @ApiQuery({ name: 'environment', required: false, enum: ['test', 'production'], example: 'test' })
  @ApiQuery({ name: 'effective_at', required: false, example: '2026-09-24' })
  async runPreflight(
    @Param('companyId') companyId: string,
    @Query('environment') rawEnvironment: string | undefined,
    @Query('effective_at') effectiveAt: string | undefined,
    @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext,
  ) {
    const environment = this.environment(rawEnvironment ?? auth?.environment ?? 'test');
    this.assertAccess(companyId, environment, auth);
    const result = await this.preflight.run(companyId, environment, effectiveAt);
    const attestation = await this.audit.record(companyId, 'preflight', result);
    return { ...result, attestation };
  }

  @Get(':companyId/history')
  @RequireScope('operations:read')
  @ApiOperation({ summary: 'List immutable onboarding and preflight attestations for the company' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  history(
    @Param('companyId') companyId: string,
    @Query('limit') rawLimit: string | undefined,
    @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext,
  ) {
    const environment = auth?.environment ?? 'test';
    this.assertAccess(companyId, environment, auth);
    const limit = rawLimit === undefined ? 50 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('limit must be an integer between 1 and 100');
    return this.audit.list(companyId, limit);
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
