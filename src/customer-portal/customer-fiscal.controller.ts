import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { RequireScope } from '../auth/require-scope.decorator';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { CustomerFiscalService } from './customer-fiscal.service';
import { UpdateCustomerFiscalProfileDto } from './dto/update-customer-fiscal-profile.dto';

@ApiTags('customer-fiscal-portal')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('portal/companies/:companyId/fiscal')
export class CustomerFiscalController {
  constructor(private readonly fiscal: CustomerFiscalService) {}

  @Get()
  @RequireScope('operations:read')
  @ApiOperation({ summary: 'Get the customer-safe fiscal onboarding journey, checklist, route and readiness state' })
  @ApiQuery({ name: 'environment', required: false, enum: ['test', 'production'] })
  @ApiQuery({ name: 'effective_at', required: false, example: '2026-09-25' })
  status(
    @Param('companyId') companyId: string,
    @Query('environment') rawEnvironment?: string,
    @Query('effective_at') effectiveAt?: string,
    @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext,
  ) {
    const environment = this.environment(rawEnvironment ?? auth?.environment ?? 'test');
    this.assertAccess(companyId, environment, auth);
    return this.fiscal.status(companyId, environment, effectiveAt);
  }

  @Post('profile')
  @RequireScope('operations:write')
  @ApiOperation({ summary: 'Update only non-secret fiscal profile fields and safely reassess the company' })
  @ApiQuery({ name: 'environment', required: false, enum: ['test', 'production'] })
  @ApiQuery({ name: 'effective_at', required: false, example: '2026-09-25' })
  updateProfile(
    @Param('companyId') companyId: string,
    @Body() dto: UpdateCustomerFiscalProfileDto,
    @Query('environment') rawEnvironment?: string,
    @Query('effective_at') effectiveAt?: string,
    @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext,
  ) {
    const environment = this.environment(rawEnvironment ?? auth?.environment ?? 'test');
    this.assertAccess(companyId, environment, auth);
    return this.fiscal.updateProfile(companyId, environment, dto, effectiveAt);
  }

  @Post('advance')
  @RequireScope('operations:write')
  @ApiOperation({ summary: 'Persist onboarding evidence and run only the safe non-emitting preflight when locally ready' })
  @ApiQuery({ name: 'environment', required: false, enum: ['test', 'production'] })
  @ApiQuery({ name: 'effective_at', required: false, example: '2026-09-25' })
  advance(
    @Param('companyId') companyId: string,
    @Query('environment') rawEnvironment?: string,
    @Query('effective_at') effectiveAt?: string,
    @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext,
  ) {
    const environment = this.environment(rawEnvironment ?? auth?.environment ?? 'test');
    this.assertAccess(companyId, environment, auth);
    return this.fiscal.advance(companyId, environment, effectiveAt);
  }

  private environment(value: string): FiscalEnvironment {
    if (value !== 'test' && value !== 'production') throw new BadRequestException('environment must be test or production');
    return value;
  }

  private assertAccess(companyId: string, environment: FiscalEnvironment, auth?: TaxAgentAuthContext) {
    if (!auth) return;
    if (auth.companyId !== companyId) throw new ForbiddenException('API key cannot operate another company');
    if (auth.environment !== environment) throw new ForbiddenException('API key environment does not match requested environment');
  }
}
