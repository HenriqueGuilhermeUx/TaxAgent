import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { MunicipalParametersModule } from '../municipal-parameters/municipal-parameters.module';
import { PreparedDpsModule } from '../prepared-dps/prepared-dps.module';
import { NfseNationalClient } from '../providers/nfse-national/nfse-national.client';
import { SchemaRegistryModule } from '../schema-registry/schema-registry.module';
import { TaxEngineModule } from '../tax-engine/tax-engine.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { XmlEngineModule } from '../xml-engine/xml-engine.module';
import { DpsPreflightService } from './dps-preflight.service';
import { OperationsController } from './operations.controller';
import { ReadinessService } from './readiness.service';

@Module({ imports: [AuthModule, TenancyModule, CertificatesModule, SchemaRegistryModule, MunicipalParametersModule, TaxEngineModule, XmlEngineModule, PreparedDpsModule], controllers: [OperationsController], providers: [ReadinessService, DpsPreflightService, NfseNationalClient] })
export class OperationsModule {}
