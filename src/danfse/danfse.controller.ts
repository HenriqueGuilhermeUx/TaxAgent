import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { RequireScope } from '../auth/require-scope.decorator';
import { DanfseService } from './danfse.service';
import { DanfseVisualConformanceService } from './danfse-visual-conformance.service';
import { CreateDanfseVisualAttestationDto } from './dto/create-danfse-visual-attestation.dto';

@ApiTags('danfse') @ApiBearerAuth() @UseGuards(ApiKeyGuard) @Controller('invoices/:invoiceId/danfse')
export class DanfseController {
  constructor(private readonly danfse: DanfseService, private readonly visual: DanfseVisualConformanceService) {}
  @Post() @RequireScope('documents:write') @HttpCode(HttpStatus.CREATED) @ApiOperation({ summary: 'Generate DANFSe locally from the authorized NFS-e XML using NT008 v1.02 renderer' })
  generate(@Param('invoiceId') invoiceId: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { return this.danfse.generate(invoiceId, auth?.companyId); }

  @Get('visual-conformance')
  @RequireScope('documents:write')
  @ApiOperation({ summary: 'Inspect TEST-only manual visual conformance readiness/evidence for the latest DANFSe' })
  visualStatus(@Param('invoiceId') invoiceId: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    if (!auth?.companyId) throw new UnauthorizedException('Authenticated company context required');
    return this.visual.status(invoiceId, auth.companyId);
  }

  @Post('visual-attestations')
  @RequireScope('documents:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Append a TEST-only manual DANFSe visual conformance attestation; never promotes the renderer automatically' })
  visualAttestation(
    @Param('invoiceId') invoiceId: string,
    @Body() dto: CreateDanfseVisualAttestationDto,
    @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext,
  ) {
    if (!auth?.companyId || !auth.keyId) throw new UnauthorizedException('Authenticated company context required');
    return this.visual.attest(invoiceId, auth.companyId, auth.keyId, dto);
  }
}
