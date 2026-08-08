import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { MunicipalParametersModule } from '../municipal-parameters/municipal-parameters.module';
import { NfseNationalClient } from '../providers/nfse-national/nfse-national.client';
import { SchemaRegistryModule } from '../schema-registry/schema-registry.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { OperationsController } from './operations.controller';
import { ReadinessService } from './readiness.service';

@Module({
  imports: [AuthModule, TenancyModule, CertificatesModule, SchemaRegistryModule, MunicipalParametersModule],
  controllers: [OperationsController],
  providers: [ReadinessService, NfseNationalClient],
})
export class OperationsModule {}
