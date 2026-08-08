import { Module } from '@nestjs/common';
import { DpsBuilderService } from './dps-builder.service';
import { DpsSequenceService } from './dps-sequence.service';
import { XmlSignatureService } from './xml-signature.service';
import { XmlValidationService } from './xml-validation.service';

@Module({
  providers: [DpsBuilderService, DpsSequenceService, XmlSignatureService, XmlValidationService],
  exports: [DpsBuilderService, XmlSignatureService, XmlValidationService],
})
export class XmlEngineModule {}
