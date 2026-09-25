import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { RequireScope } from '../auth/require-scope.decorator';
import { CertificateVaultService } from './certificate-vault.service';
import { UploadCertificateDto } from './dto/upload-certificate.dto';

type BrowserUploadedFile = {
  buffer?: Buffer;
  originalname?: string;
  size?: number;
  mimetype?: string;
};

@ApiTags('certificates')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('companies/:companyId/certificates')
export class CertificatesController {
  constructor(private readonly vault: CertificateVaultService) {}

  @Post()
  @RequireScope('certificates:write')
  upload(
    @Param('companyId') companyId: string,
    @Body() dto: UploadCertificateDto,
    @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext,
  ) {
    this.assertCompany(companyId, auth);
    return this.vault.store(companyId, dto.pfx_base64, dto.password);
  }

  @Post('upload')
  @RequireScope('certificates:write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'password'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'A1 PKCS#12 certificate (.pfx or .p12).' },
        password: { type: 'string', format: 'password', description: 'Password used only to open and validate the PKCS#12 before encrypted storage.' },
      },
    },
  })
  uploadFromBrowser(
    @Param('companyId') companyId: string,
    @UploadedFile() file: BrowserUploadedFile | undefined,
    @Body('password') password: string | undefined,
    @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext,
  ) {
    this.assertCompany(companyId, auth);
    if (!file?.buffer?.length) throw new BadRequestException('Select a .pfx or .p12 A1 certificate file');
    if (!password) throw new BadRequestException('Certificate password is required');
    const name = String(file.originalname ?? '').toLowerCase();
    if (name && !name.endsWith('.pfx') && !name.endsWith('.p12')) {
      throw new BadRequestException('Certificate file must use .pfx or .p12 extension');
    }
    return this.vault.store(companyId, file.buffer.toString('base64'), password);
  }

  @Get()
  @RequireScope('certificates:read')
  list(
    @Param('companyId') companyId: string,
    @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext,
  ) {
    this.assertCompany(companyId, auth);
    return this.vault.metadata(companyId);
  }

  private assertCompany(companyId: string, auth?: TaxAgentAuthContext) {
    if (auth && auth.companyId !== companyId) throw new ForbiddenException('API key cannot operate another company');
  }
}
