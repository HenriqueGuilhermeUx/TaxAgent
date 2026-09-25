import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CertificateVaultService } from './certificate-vault.service';
import { CertificatesController } from './certificates.controller';

@Module({
  imports: [AuthModule],
  controllers: [CertificatesController],
  providers: [CertificateVaultService],
  exports: [CertificateVaultService],
})
export class CertificatesModule {}
