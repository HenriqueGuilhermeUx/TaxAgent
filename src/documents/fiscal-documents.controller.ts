import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { FiscalDocumentsService } from './fiscal-documents.service';

@ApiTags('fiscal-documents')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('invoices/:invoiceId/documents')
export class FiscalDocumentsController {
  constructor(private readonly documents: FiscalDocumentsService) {}

  @Get()
  list(@Param('invoiceId') invoiceId: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    return this.documents.list(invoiceId, auth?.companyId);
  }

  @Get(':documentId/content')
  async content(
    @Param('invoiceId') invoiceId: string,
    @Param('documentId') documentId: string,
    @CurrentTaxAgentAuth() auth: TaxAgentAuthContext | undefined,
    @Res() res: any,
  ) {
    const document = await this.documents.get(invoiceId, documentId, auth?.companyId);
    res.setHeader('content-type', document.content_type ?? 'application/octet-stream');
    res.setHeader('etag', `"${document.sha256}"`);
    res.setHeader('content-disposition', `attachment; filename="${document.kind}-${document.id}.xml"`);
    res.send(document.content);
  }
}
