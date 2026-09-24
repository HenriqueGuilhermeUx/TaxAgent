import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlugNotasClient } from '../providers/plugnotas/plugnotas.client';
import { GatewayCapabilityService } from './gateway-capability.service';
import { IbgeLocationsClient } from './ibge-locations.client';
import { MetropolitanCoverageService } from './metropolitan-coverage.service';
import { MunicipalParametersClient } from './municipal-parameters.client';
import { MunicipalParametersController } from './municipal-parameters.controller';
import { NationalCoverageService } from './national-coverage.service';
import { MunicipalCapabilityService } from './municipal-capability.service';

@Module({
  imports: [AuthModule],
  controllers: [MunicipalParametersController],
  providers: [MunicipalParametersClient, NationalCoverageService, MunicipalCapabilityService, IbgeLocationsClient, MetropolitanCoverageService, PlugNotasClient, GatewayCapabilityService],
  exports: [MunicipalParametersClient, NationalCoverageService, MunicipalCapabilityService, IbgeLocationsClient, MetropolitanCoverageService, PlugNotasClient, GatewayCapabilityService],
})
export class MunicipalParametersModule {}
