import { Module } from '@nestjs/common';
import { CertificateVaultService } from './certificate-vault.service';
import { CertificatesController } from './certificates.controller';

@Module({
  controllers: [CertificatesController],
  providers: [CertificateVaultService],
  exports: [CertificateVaultService],
})
export class CertificatesModule {}
