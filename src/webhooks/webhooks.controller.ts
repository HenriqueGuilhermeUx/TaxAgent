import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('companies/:companyId/webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post()
  create(@Param('companyId') companyId: string, @Body() dto: CreateWebhookDto, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    this.assertCompany(companyId, auth);
    return this.webhooks.createEndpoint(companyId, dto.url, dto.events);
  }

  @Get()
  list(@Param('companyId') companyId: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    this.assertCompany(companyId, auth);
    return this.webhooks.listEndpoints(companyId);
  }

  private assertCompany(companyId: string, auth?: TaxAgentAuthContext) {
    if (auth && auth.companyId !== companyId) throw new ForbiddenException('API key cannot operate another company');
  }
}
