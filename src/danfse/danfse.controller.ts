import { Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { RequireScope } from '../auth/require-scope.decorator';
import { DanfseService } from './danfse.service';

@ApiTags('danfse') @ApiBearerAuth() @UseGuards(ApiKeyGuard) @Controller('invoices/:invoiceId/danfse')
export class DanfseController {
  constructor(private readonly danfse: DanfseService) {}
  @Post() @RequireScope('documents:write') @HttpCode(HttpStatus.CREATED) @ApiOperation({ summary: 'Generate DANFSe locally from the authorized NFS-e XML using NT008 v1.02 renderer' })
  generate(@Param('invoiceId') invoiceId: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { return this.danfse.generate(invoiceId, auth?.companyId); }
}
