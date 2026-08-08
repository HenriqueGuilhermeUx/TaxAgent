import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CertificateVaultService } from './certificate-vault.service';
import { UploadCertificateDto } from './dto/upload-certificate.dto';

@ApiTags('certificates')
@Controller('companies/:companyId/certificates')
export class CertificatesController {
  constructor(private readonly vault: CertificateVaultService) {}

  @Post()
  upload(@Param('companyId') companyId: string, @Body() dto: UploadCertificateDto) {
    return this.vault.store(companyId, dto.pfx_base64, dto.password);
  }

  @Get()
  list(@Param('companyId') companyId: string) {
    return this.vault.metadata(companyId);
  }
}
