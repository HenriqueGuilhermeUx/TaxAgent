import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { CertificateVaultService } from './certificate-vault.service';
import { UploadCertificateDto } from './dto/upload-certificate.dto';

@ApiTags('certificates')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('companies/:companyId/certificates')
export class CertificatesController {
  constructor(private readonly vault: CertificateVaultService) {}

  @Post()
  upload(@Param('companyId') companyId: string, @Body() dto: UploadCertificateDto, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    this.assertCompany(companyId, auth);
    return this.vault.store(companyId, dto.pfx_base64, dto.password);
  }

  @Get()
  list(@Param('companyId') companyId: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    this.assertCompany(companyId, auth);
    return this.vault.metadata(companyId);
  }

  private assertCompany(companyId: string, auth?: TaxAgentAuthContext) {
    if (auth && auth.companyId !== companyId) throw new ForbiddenException('API key cannot operate another company');
  }
}
