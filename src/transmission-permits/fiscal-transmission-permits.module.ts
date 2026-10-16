import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PreparedDpsModule } from '../prepared-dps/prepared-dps.module';
import { FiscalTransmissionPermitController } from './fiscal-transmission-permit.controller';
import { FiscalTransmissionPermitService } from './fiscal-transmission-permit.service';

@Module({
  imports:[AuthModule,PreparedDpsModule],
  controllers:[FiscalTransmissionPermitController],
  providers:[FiscalTransmissionPermitService],
  exports:[FiscalTransmissionPermitService],
})
export class FiscalTransmissionPermitsModule {}
