import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { BootstrapGuard } from '../auth/bootstrap.guard';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { RequireScope } from '../auth/require-scope.decorator';
import { ResolveTaxDto } from './dto/resolve-tax.dto';
import { TaxDomainRegistryService } from './tax-domain-registry.service';
import { TaxEngineService } from './tax-engine.service';
import { TaxPositionService } from './tax-position.service';

@ApiTags('tax-engine') @Controller('tax')
export class TaxEngineController {
  constructor(private readonly engine: TaxEngineService, private readonly domains: TaxDomainRegistryService, private readonly position: TaxPositionService) {}
  @Post('resolve') @ApiBearerAuth() @UseGuards(ApiKeyGuard) @RequireScope('tax:resolve') @ApiOperation({ summary: 'Resolve/validate an IBS/CBS tax decision without guessing missing fiscal inputs' }) resolve(@Body() dto: ResolveTaxDto, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { if (auth && auth.companyId !== dto.company_id) throw new ForbiddenException('API key cannot operate another company'); return this.engine.resolve(dto); }
  @Get('decisions/:id') @ApiBearerAuth() @UseGuards(ApiKeyGuard) @RequireScope('tax:read') getDecision(@Param('id') id: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { return this.position.getDecision(id, auth?.companyId); }
  @Get('position/:companyId') @ApiBearerAuth() @UseGuards(ApiKeyGuard) @RequireScope('tax:read') getPosition(@Param('companyId') companyId: string, @Query('period') period: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { if (auth && auth.companyId !== companyId) throw new ForbiddenException('API key cannot operate another company'); if (!period) throw new BadRequestException('period query parameter is required'); if (!auth?.environment) throw new ForbiddenException('API key environment is required'); return this.position.getPosition(companyId, period, auth.environment); }
  @Get('domains') @ApiBearerAuth() @UseGuards(ApiKeyGuard) @RequireScope('tax:read') @ApiOperation({ summary: 'Get TaxAgent tax-domain source registry and authority levels' }) domainsMetadata() { return this.domains.metadata(); }
  @Post('domains/sync') @ApiHeader({ name: 'X-TaxAgent-Bootstrap-Token', required: true }) @UseGuards(BootstrapGuard) @ApiOperation({ summary: 'Snapshot the current official RTC open-data runtime version' }) syncDomains() { return this.domains.syncRuntimeVersion(); }
}
