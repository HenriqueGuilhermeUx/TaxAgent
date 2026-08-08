import { Body, Controller, ForbiddenException, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { BootstrapGuard } from '../auth/bootstrap.guard';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { RequireScope } from '../auth/require-scope.decorator';
import { ResolveTaxDto } from './dto/resolve-tax.dto';
import { TaxDomainRegistryService } from './tax-domain-registry.service';
import { TaxEngineService } from './tax-engine.service';

@ApiTags('tax-engine')
@Controller('tax')
export class TaxEngineController {
  constructor(private readonly engine: TaxEngineService, private readonly domains: TaxDomainRegistryService) {}

  @Post('resolve')
  @ApiBearerAuth()
  @UseGuards(ApiKeyGuard)
  @RequireScope('tax:resolve')
  @ApiOperation({ summary: 'Resolve/validate an IBS/CBS tax decision without guessing missing fiscal inputs' })
  resolve(@Body() dto: ResolveTaxDto, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    if (auth && auth.companyId !== dto.company_id) throw new ForbiddenException('API key cannot operate another company');
    return this.engine.resolve(dto);
  }

  @Get('domains')
  @ApiBearerAuth()
  @UseGuards(ApiKeyGuard)
  @RequireScope('tax:read')
  @ApiOperation({ summary: 'Get TaxAgent tax-domain source registry and authority levels' })
  domainsMetadata() { return this.domains.metadata(); }

  @Post('domains/sync')
  @ApiHeader({ name: 'X-TaxAgent-Bootstrap-Token', required: true })
  @UseGuards(BootstrapGuard)
  @ApiOperation({ summary: 'Snapshot the current official RTC open-data runtime version' })
  syncDomains() { return this.domains.syncRuntimeVersion(); }
}
