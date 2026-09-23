import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { RequireScope } from '../auth/require-scope.decorator';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';
import { PreparedDpsService } from '../prepared-dps/prepared-dps.service';
import { DpsPreflightService } from './dps-preflight.service';
import { GissQueryExecutionService } from './giss-query-execution.service';
import { GissWsdlDiagnosticService } from './giss-wsdl-diagnostic.service';
import { MunicipalityScenarioService } from './municipality-scenario.service';
import { NationalDpsEligibilityService } from './national-dps-eligibility.service';
import { NationalPreflightService } from './national-preflight.service';
import { NoA1HomologationService } from './no-a1-homologation.service';
import { ReadinessService } from './readiness.service';

@ApiTags('operations') @ApiBearerAuth() @UseGuards(ApiKeyGuard) @Controller('operations')
export class OperationsController {
  constructor(
    private readonly readiness: ReadinessService,
    private readonly dpsPreflight: DpsPreflightService,
    private readonly preparedDps: PreparedDpsService,
    private readonly noA1: NoA1HomologationService,
    private readonly gissWsdl: GissWsdlDiagnosticService,
    private readonly gissQuery: GissQueryExecutionService,
    private readonly municipalityScenario: MunicipalityScenarioService,
    private readonly nationalPreflight: NationalPreflightService,
    private readonly nationalDpsEligibility: NationalDpsEligibilityService,
  ) {}
  @Get('readiness/:companyId') @RequireScope('operations:read') @ApiOperation({ summary: 'Inspect local gates required before real NFS-e transmission' })
  report(@Param('companyId') companyId: string, @Query('environment') rawEnvironment: string | undefined, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { const environment = this.environment(rawEnvironment ?? auth?.environment ?? 'test'); this.assertAccess(companyId, environment, auth); return this.readiness.report(companyId, environment); }
  @Post('readiness/:companyId/probe') @RequireScope('operations:read') @ApiOperation({ summary: 'Run non-emitting Produção Restrita/Produção connectivity preflight' })
  probe(@Param('companyId') companyId: string, @Query('environment') rawEnvironment: string | undefined, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { const environment = this.environment(rawEnvironment ?? auth?.environment ?? 'test'); this.assertAccess(companyId, environment, auth); return this.readiness.probe(companyId, environment); }
  @Post('national/preflight/:companyId') @RequireScope('operations:read') @ApiOperation({ summary: 'Reuse the Company A1 to probe National NFS-e mTLS and target-municipality parameters without transmitting a fiscal document' })
  probeNational(@Param('companyId') companyId: string, @Query('environment') rawEnvironment: string | undefined, @Query('targetCityCode') targetCityCode: string | undefined, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { const environment = this.environment(rawEnvironment ?? auth?.environment ?? 'test'); this.assertAccess(companyId, environment, auth); if (!targetCityCode) throw new BadRequestException('targetCityCode is required'); return this.nationalPreflight.probe(companyId, environment, targetCityCode); }
  @Post('giss/wsdl/:companyId') @RequireScope('operations:read') @ApiOperation({ summary: 'Inspect the authenticated GISS homologation WSDL without fiscal transmission' })
  inspectGissWsdl(@Param('companyId') companyId: string, @Query('environment') rawEnvironment: string | undefined, @Query('cityCode') cityCode: string | undefined, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { const environment = this.environment(rawEnvironment ?? auth?.environment ?? 'test'); this.assertAccess(companyId, environment, auth); return this.gissWsdl.inspect(companyId, environment, cityCode ?? '3548500'); }
  @Post('giss/query/prepare/:companyId') @RequireScope('operations:read') @ApiOperation({ summary: 'Prepare exact authenticated-WSDL GISS ConsultarNfsePorRps SOAP bytes without POSTing them' })
  prepareGissRpsQuery(@Param('companyId') companyId: string, @Query('environment') rawEnvironment: string | undefined, @Query('cityCode') cityCode: string | undefined, @Query('number') number: string | undefined, @Query('series') series: string | undefined, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { const environment = this.environment(rawEnvironment ?? auth?.environment ?? 'test'); this.assertAccess(companyId, environment, auth); return this.gissWsdl.prepareQuery(companyId, environment, cityCode ?? '3548500', number ?? '1', series ?? 'TA'); }
  @Post('giss/query/execute/:companyId/:invoiceId') @RequireScope('operations:write') @ApiOperation({ summary: 'Execute one audited GISS ConsultarNfsePorRps query for a persisted test RPS; never emits an RPS' })
  executeGissRpsQuery(@Param('companyId') companyId: string, @Param('invoiceId') invoiceId: string, @Query('environment') rawEnvironment: string | undefined, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { const environment = this.environment(rawEnvironment ?? auth?.environment ?? 'test'); this.assertAccess(companyId, environment, auth); return this.gissQuery.execute(companyId, environment, invoiceId); }
  @Post('scenario/municipality/:companyId') @RequireScope('operations:read') @ApiOperation({ summary: 'Inspect a cross-municipality service scenario using the same Company/A1 without changing issuer city or transmitting a fiscal document' })
  inspectMunicipalityScenario(@Param('companyId') companyId: string, @Query('environment') rawEnvironment: string | undefined, @Query('serviceCityCode') serviceCityCode: string | undefined, @Query('effectiveAt') effectiveAt: string | undefined, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { const environment = this.environment(rawEnvironment ?? auth?.environment ?? 'test'); this.assertAccess(companyId, environment, auth); if (!serviceCityCode) throw new BadRequestException('serviceCityCode is required'); return this.municipalityScenario.inspect(companyId, environment, serviceCityCode, effectiveAt); }
  @Post('no-a1/validate') @RequireScope('operations:write') @ApiOperation({ summary: 'Validate the full pre-certificate fiscal path without A1, XML signature or SEFIN transmission' })
  validateWithoutA1(@Body() dto: CreateInvoiceDto, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { this.assertAccess(dto.company_id, dto.environment, auth); return this.noA1.validate(dto); }
  @Post('dps/prebuild') @RequireScope('operations:write') @ApiOperation({ summary: 'Build and XSD-validate an unsigned DPS without A1 or SEFIN transmission' })
  prebuildDps(@Body() dto: CreateInvoiceDto, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { this.assertAccess(dto.company_id, dto.environment, auth); return this.dpsPreflight.prebuild(dto); }
  @Post('dps/prepare') @RequireScope('operations:write') @ApiOperation({ summary: 'Persist an immutable XSD-valid Prepared DPS with real sequence only for a proven national-direct issuer route' })
  async prepareDps(@Body() dto: CreateInvoiceDto, @Headers('idempotency-key') idempotencyKey: string | undefined, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { this.assertAccess(dto.company_id, dto.environment, auth); await this.nationalDpsEligibility.assertPreparedDpsAllowed(dto); return this.preparedDps.prepare(dto, idempotencyKey ?? ''); }
  @Get('dps/prepared/:preparedDpsId') @RequireScope('operations:read') @ApiOperation({ summary: 'Inspect immutable Prepared DPS metadata and hashes' })
  inspectPreparedDps(@Param('preparedDpsId') preparedDpsId: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { return this.preparedDps.inspect(preparedDpsId, this.requireAuthCompany(auth)); }
  @Post('dps/prepared/:preparedDpsId/sign') @RequireScope('operations:write') @ApiOperation({ summary: 'Sign a persisted Prepared DPS with A1 only when its issuer route is proven national-direct; never transmits' })
  async signPreparedDps(@Param('preparedDpsId') preparedDpsId: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    const companyId = this.requireAuthCompany(auth);
    const record = await this.preparedDps.get(preparedDpsId, companyId);
    const effectiveAt = record.competence ? String(record.competence).slice(0, 10) : undefined;
    await this.nationalDpsEligibility.assertCompanyAllowed(companyId, record.environment, effectiveAt);
    return this.preparedDps.sign(preparedDpsId, companyId);
  }
  @Post('dps/validate') @RequireScope('operations:write') @ApiOperation({ summary: 'Build, XSD-validate and A1-sign a DPS only for a proven national-direct issuer route; never transmits' })
  async validateDps(@Body() dto: CreateInvoiceDto, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { this.assertAccess(dto.company_id, dto.environment, auth); await this.nationalDpsEligibility.assertPreparedDpsAllowed(dto); return this.dpsPreflight.validate(dto); }
  private environment(value: string): FiscalEnvironment { if (value !== 'test' && value !== 'production') throw new BadRequestException('environment must be test or production'); return value; }
  private assertAccess(companyId: string, environment: FiscalEnvironment, auth?: TaxAgentAuthContext) { if (!auth) return; if (auth.companyId !== companyId) throw new ForbiddenException('API key cannot inspect another company'); if (auth.environment !== environment) throw new ForbiddenException('API key environment does not match requested environment'); }
  private requireAuthCompany(auth?: TaxAgentAuthContext): string { if (!auth?.companyId) throw new ForbiddenException('API key authentication is required'); return auth.companyId; }
}
