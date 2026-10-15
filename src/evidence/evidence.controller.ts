import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { BootstrapGuard } from '../auth/bootstrap.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { RequireScope } from '../auth/require-scope.decorator';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { CreateRegulatoryChangeDto, UploadEvidenceDocumentDto } from './dto/evidence.dto';
import { DocumentEvidenceService } from './document-evidence.service';

@ApiTags('customer-evidence')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('portal/companies/:companyId/evidence')
export class EvidenceController {
  constructor(private readonly evidence: DocumentEvidenceService) {}

  @Get()
  @RequireScope('operations:read')
  overview(@Param('companyId') companyId: string, @Query('environment') raw?: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    const environment = this.environment(raw ?? auth?.environment ?? 'test');
    this.assertAccess(companyId, environment, auth);
    return this.evidence.overview(companyId, environment);
  }

  @Get('documents')
  @RequireScope('operations:read')
  list(@Param('companyId') companyId: string, @Query('environment') raw?: string, @Query('limit') rawLimit?: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    const environment = this.environment(raw ?? auth?.environment ?? 'test');
    this.assertAccess(companyId, environment, auth);
    const limit = rawLimit ? Number(rawLimit) : 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new BadRequestException('limit must be an integer between 1 and 200');
    return this.evidence.list(companyId, environment, limit);
  }

  @Post('documents')
  @RequireScope('operations:write')
  @ApiOperation({ summary: 'Store document evidence in the private evidence engine and persist only its safe reference in TaxAgent' })
  upload(@Param('companyId') companyId: string, @Body() dto: UploadEvidenceDocumentDto, @Query('environment') raw?: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    const environment = this.environment(raw ?? auth?.environment ?? 'test');
    this.assertAccess(companyId, environment, auth);
    return this.evidence.upload(companyId, environment, dto);
  }

  @Post('documents/:documentId/analyze')
  @RequireScope('operations:write')
  analyze(@Param('companyId') companyId: string, @Param('documentId') documentId: string, @Query('environment') raw?: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    const environment = this.environment(raw ?? auth?.environment ?? 'test');
    this.assertAccess(companyId, environment, auth);
    return this.evidence.analyze(companyId, environment, documentId);
  }

  @Get('documents/:documentId')
  @RequireScope('operations:read')
  intelligence(@Param('companyId') companyId: string, @Param('documentId') documentId: string, @Query('environment') raw?: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    const environment = this.environment(raw ?? auth?.environment ?? 'test');
    this.assertAccess(companyId, environment, auth);
    return this.evidence.intelligence(companyId, environment, documentId);
  }

  @Get('documents/:documentId/audit')
  @RequireScope('operations:read')
  audit(@Param('companyId') companyId: string, @Param('documentId') documentId: string, @Query('environment') raw?: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    const environment = this.environment(raw ?? auth?.environment ?? 'test');
    this.assertAccess(companyId, environment, auth);
    return this.evidence.audit(companyId, environment, documentId);
  }

  @Get('regulatory-changes')
  @RequireScope('operations:read')
  regulatoryChanges(@Param('companyId') companyId: string, @Query('environment') raw?: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    const environment = this.environment(raw ?? auth?.environment ?? 'test');
    this.assertAccess(companyId, environment, auth);
    return this.evidence.regulatoryChanges(companyId);
  }

  @Get('dossier')
  @RequireScope('operations:read')
  @ApiQuery({ name: 'period', required: true, example: '2026-09' })
  dossier(@Param('companyId') companyId: string, @Query('period') period: string, @Query('environment') raw?: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    const environment = this.environment(raw ?? auth?.environment ?? 'test');
    this.assertAccess(companyId, environment, auth);
    if (!/^\d{4}-\d{2}$/.test(period ?? '')) throw new BadRequestException('period must use YYYY-MM');
    const month = Number(period.slice(5, 7));
    if (month < 1 || month > 12) throw new BadRequestException('period month must be 01..12');
    return this.evidence.dossier(companyId, environment, period);
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

@ApiTags('regulatory-changes-operations')
@UseGuards(BootstrapGuard)
@Controller('operations/regulatory-changes')
export class RegulatoryChangesController {
  constructor(private readonly evidence: DocumentEvidenceService) {}

  @Post()
  @ApiOperation({ summary: 'Register an official fiscal rule change and optionally preserve its source document as hashed evidence' })
  create(@Body() dto: CreateRegulatoryChangeDto) {
    return this.evidence.createRegulatoryChange(dto);
  }
}
