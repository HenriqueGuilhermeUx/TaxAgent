import { Body, Controller, ForbiddenException, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { RequireScope } from '../auth/require-scope.decorator';
import { AnswerFiscalAutopilotDto, CreateFiscalAutopilotDto } from './dto/fiscal-autopilot.dto';
import { FiscalAutopilotService } from './fiscal-autopilot.service';

@ApiTags('fiscal-autopilot')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('fiscal/autopilot')
export class FiscalAutopilotController {
  constructor(private readonly autopilot: FiscalAutopilotService) {}

  @Get('context')
  @RequireScope('invoices:read')
  @ApiOperation({ summary: 'Return the company/environment already bound to the authenticated API key' })
  context(@CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    if (!auth) throw new ForbiddenException('Authenticated API key required');
    return { company_id: auth.companyId, environment: auth.environment };
  }

  @Post()
  @RequireScope('invoices:write')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Start a human-first fiscal intent and automatically advance it as far as safely possible' })
  start(
    @Body() dto: CreateFiscalAutopilotDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext,
  ) {
    this.assertAccess(dto.company_id, dto.environment, auth);
    return this.autopilot.start(dto, idempotencyKey);
  }

  @Get(':id')
  @RequireScope('invoices:read')
  @ApiOperation({ summary: 'Inspect a Fiscal Autopilot intent without recreating any fiscal artifact' })
  inspect(@Param('id') id: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    if (!auth) throw new ForbiddenException('Authenticated API key required');
    return this.autopilot.inspect(id, auth.companyId);
  }

  @Post(':id/answer')
  @RequireScope('invoices:write')
  @ApiOperation({ summary: 'Answer a human question and let the same Fiscal Intent continue automatically' })
  answer(@Param('id') id: string, @Body() dto: AnswerFiscalAutopilotDto, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    if (!auth) throw new ForbiddenException('Authenticated API key required');
    return this.autopilot.answer(id, auth.companyId, dto);
  }

  @Post(':id/continue')
  @RequireScope('invoices:write')
  @ApiOperation({ summary: 'Continue the same Fiscal Intent after certificate/readiness/system prerequisites change' })
  continueIntent(@Param('id') id: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    if (!auth) throw new ForbiddenException('Authenticated API key required');
    return this.autopilot.continue(id, auth.companyId);
  }

  private assertAccess(companyId: string, environment: 'test' | 'production', auth?: TaxAgentAuthContext): void {
    if (!auth) return;
    if (auth.companyId !== companyId) throw new ForbiddenException('API key cannot operate another company');
    if (auth.environment !== environment) throw new ForbiddenException('API key environment does not match request environment');
  }
}
