import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { RequireScope } from '../auth/require-scope.decorator';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { UpsertProviderCredentialsDto } from './dto/upsert-provider-credentials.dto';
import { ProviderCredentialsService } from './provider-credentials.service';

@ApiTags('provider-credentials')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('companies/:companyId/provider-credentials')
export class ProviderCredentialsController {
  constructor(private readonly credentials: ProviderCredentialsService) {}

  @Post()
  @RequireScope('credentials:write')
  store(
    @Param('companyId') companyId: string,
    @Body() dto: UpsertProviderCredentialsDto,
    @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext,
  ) {
    this.assertCompany(companyId, auth);
    return this.credentials.store(companyId, dto.provider, dto.environment, dto.credentials, dto.note);
  }

  @Get()
  @RequireScope('credentials:read')
  list(
    @Param('companyId') companyId: string,
    @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext,
  ) {
    this.assertCompany(companyId, auth);
    return this.credentials.list(companyId);
  }

  @Post(':provider/disable')
  @RequireScope('credentials:write')
  disable(
    @Param('companyId') companyId: string,
    @Param('provider') provider: string,
    @Query('environment') environment: FiscalEnvironment = 'test',
    @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext,
  ) {
    this.assertCompany(companyId, auth);
    return this.credentials.disable(companyId, provider, environment);
  }

  private assertCompany(companyId: string, auth?: TaxAgentAuthContext) {
    if (auth && auth.companyId !== companyId) throw new ForbiddenException('API key cannot operate another company');
  }
}
