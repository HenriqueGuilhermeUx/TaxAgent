import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller('companies/:companyId/webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post()
  create(@Param('companyId') companyId: string, @Body() dto: CreateWebhookDto) {
    return this.webhooks.createEndpoint(companyId, dto.url, dto.events);
  }

  @Get()
  list(@Param('companyId') companyId: string) {
    return this.webhooks.listEndpoints(companyId);
  }
}
