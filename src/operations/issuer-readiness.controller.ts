import { BadRequestException, Controller, ForbiddenException, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { RequireScope } from '../auth/require-scope.decorator';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { IssuerReadinessService } from './issuer-readiness.service';

@ApiTags('operations')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('operations/issuer-readiness')
export class IssuerReadinessController {
  constructor(private readonly readiness: IssuerReadinessService) {}

  @Get(':companyId')
  @RequireScope('operations:read')
  @ApiOperation({ summary: 'Inspect whether the persisted Company can perform a real National NFS-e test issuance without transmitting anything' })
  @ApiQuery({ name: 'environment', required: false, enum: ['test', 'production'], example: 'test' })
  @ApiQuery({ name: 'effectiveAt', required: false, example: '2026-09-24', description: 'Civil date used for time-bound routing rules.' })
  inspect(
    @Param('companyId') companyId: string,
    @Query('environment') rawEnvironment: string | undefined,
    @Query('effectiveAt') effectiveAt: string | undefined,
    @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext,
  ) {
    if (!auth) throw new ForbiddenException('API key authentication is required');
    const environment = this.environment(rawEnvironment ?? auth.environment);
    if (auth.companyId !== companyId) throw new ForbiddenException('API key cannot inspect another company');
    if (auth.environment !== environment) throw new ForbiddenException('API key environment does not match requested environment');
    if (effectiveAt && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveAt)) throw new BadRequestException('effectiveAt must use YYYY-MM-DD');
    return this.readiness.inspect(companyId, environment, effectiveAt);
  }

  private environment(value: string): FiscalEnvironment {
    if (value !== 'test' && value !== 'production') throw new BadRequestException('environment must be test or production');
    return value;
  }
}
