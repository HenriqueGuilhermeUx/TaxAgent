import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MunicipalParametersClient } from './municipal-parameters.client';
import { MunicipalParametersController } from './municipal-parameters.controller';
import { NationalCoverageService } from './national-coverage.service';

@Module({
  imports: [AuthModule],
  controllers: [MunicipalParametersController],
  providers: [MunicipalParametersClient, NationalCoverageService],
  exports: [MunicipalParametersClient, NationalCoverageService],
})
export class MunicipalParametersModule {}
