import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { RequireScope } from '../auth/require-scope.decorator';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';
import { DpsPreflightService } from './dps-preflight.service';
import { ReadinessService } from './readiness.service';

@ApiTags('operations') @ApiBearerAuth() @UseGuards(ApiKeyGuard) @Controller('operations')
export class OperationsController {
  constructor(private readonly readiness: ReadinessService, private readonly dpsPreflight: DpsPreflightService) {}
  @Get('readiness/:companyId') @RequireScope('operations:read') @ApiOperation({ summary: 'Inspect local gates required before real NFS-e transmission' })
  report(@Param('companyId') companyId: string, @Query('environment') rawEnvironment: string | undefined, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { const environment = this.environment(rawEnvironment ?? auth?.environment ?? 'test'); this.assertAccess(companyId, environment, auth); return this.readiness.report(companyId, environment); }
  @Post('readiness/:companyId/probe') @RequireScope('operations:read') @ApiOperation({ summary: 'Run non-emitting Produção Restrita/Produção connectivity preflight' })
  probe(@Param('companyId') companyId: string, @Query('environment') rawEnvironment: string | undefined, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { const environment = this.environment(rawEnvironment ?? auth?.environment ?? 'test'); this.assertAccess(companyId, environment, auth); return this.readiness.probe(companyId, environment); }
  @Post('dps/prebuild') @RequireScope('operations:write') @ApiOperation({ summary: 'Build and XSD-validate an unsigned DPS without A1 or SEFIN transmission' })
  prebuildDps(@Body() dto: CreateInvoiceDto, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { this.assertAccess(dto.company_id, dto.environment, auth); return this.dpsPreflight.prebuild(dto); }
  @Post('dps/validate') @RequireScope('operations:write') @ApiOperation({ summary: 'Build, XSD-validate, A1-sign and revalidate a DPS without sending it to SEFIN' })
  validateDps(@Body() dto: CreateInvoiceDto, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { this.assertAccess(dto.company_id, dto.environment, auth); return this.dpsPreflight.validate(dto); }
  private environment(value: string): FiscalEnvironment { if (value !== 'test' && value !== 'production') throw new BadRequestException('environment must be test or production'); return value; }
  private assertAccess(companyId: string, environment: FiscalEnvironment, auth?: TaxAgentAuthContext) { if (!auth) return; if (auth.companyId !== companyId) throw new ForbiddenException('API key cannot inspect another company'); if (auth.environment !== environment) throw new ForbiddenException('API key environment does not match requested environment'); }
}
