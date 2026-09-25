import { Module } from '@nestjs/common';
import { CertificatesModule } from '../certificates/certificates.module';
import { SchemaRegistryModule } from '../schema-registry/schema-registry.module';
import { TaxEngineModule } from '../tax-engine/tax-engine.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { XmlEngineModule } from '../xml-engine/xml-engine.module';
import { PreparedDpsService } from './prepared-dps.service';

@Module({
  imports: [TenancyModule, TaxEngineModule, XmlEngineModule, CertificatesModule, SchemaRegistryModule],
  providers: [PreparedDpsService],
  exports: [PreparedDpsService],
})
export class PreparedDpsModule {}
