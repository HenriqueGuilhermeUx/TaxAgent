import { Controller, ForbiddenException, Get, HttpCode, HttpStatus, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { RequireScope } from '../auth/require-scope.decorator';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { FiscalInboxService } from './fiscal-inbox.service';

@ApiTags('fiscal-inbox')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('companies/:companyId/inbox')
export class FiscalInboxController {
  constructor(private readonly inbox: FiscalInboxService) {}

  @Post('sync')
  @RequireScope('inbox:write')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue one ADN/NSU fiscal inbox synchronization batch' })
  sync(@Param('companyId') companyId: string, @Query('environment') environment: FiscalEnvironment = 'test', @Query('cnpjConsulta') cnpjConsulta: string | undefined, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    this.assertAuth(companyId, environment, auth);
    return this.inbox.requestSync(companyId, environment, cnpjConsulta);
  }

  @Get('documents')
  @RequireScope('inbox:read')
  list(@Param('companyId') companyId: string, @Query('environment') environment: FiscalEnvironment = 'test', @Query('limit') limit = '50', @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    this.assertAuth(companyId, environment, auth);
    return this.inbox.list(companyId, environment, Number(limit));
  }

  @Get('documents/:documentId/content')
  @RequireScope('inbox:read')
  async content(@Param('companyId') companyId: string, @Param('documentId') documentId: string, @CurrentTaxAgentAuth() auth: TaxAgentAuthContext | undefined, @Res() res: any) {
    if (auth && auth.companyId !== companyId) throw new ForbiddenException('API key cannot operate another company');
    const document = await this.inbox.getContent(companyId, documentId);
    res.setHeader('content-type', document.content_type ?? 'application/octet-stream');
    if (document.sha256) res.setHeader('etag', `"${document.sha256}"`);
    res.setHeader('content-disposition', `attachment; filename="adn-${documentId}.xml"`);
    res.send(document.content);
  }

  @Get('nfse/:accessKey/events')
  @RequireScope('inbox:read')
  events(@Param('companyId') companyId: string, @Param('accessKey') accessKey: string, @Query('environment') environment: FiscalEnvironment = 'test', @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    this.assertAuth(companyId, environment, auth);
    return this.inbox.getEvents(companyId, environment, accessKey);
  }

  private assertAuth(companyId: string, environment: FiscalEnvironment, auth?: TaxAgentAuthContext) {
    if (auth && auth.companyId !== companyId) throw new ForbiddenException('API key cannot operate another company');
    if (auth && auth.environment !== environment) throw new ForbiddenException('API key environment does not match request environment');
  }
}
