import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentIntakeController } from './document-intake.controller';
import { DocumentIntakeService } from './document-intake.service';

@Module({
  imports: [AuthModule],
  controllers: [DocumentIntakeController],
  providers: [DocumentIntakeService],
  exports: [DocumentIntakeService],
})
export class DocumentIntakeModule {}
