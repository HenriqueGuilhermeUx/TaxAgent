import { Module } from '@nestjs/common';
import { SchemaRegistryModule } from '../schema-registry/schema-registry.module';
import { DpsBuilderService } from './dps-builder.service';
import { DpsSequenceService } from './dps-sequence.service';
import { EventBuilderService } from './event-builder.service';
import { XmlSignatureService } from './xml-signature.service';
import { XmlValidationService } from './xml-validation.service';

@Module({
  imports: [SchemaRegistryModule],
  providers: [DpsBuilderService, DpsSequenceService, EventBuilderService, XmlSignatureService, XmlValidationService],
  exports: [DpsBuilderService, EventBuilderService, XmlSignatureService, XmlValidationService],
})
export class XmlEngineModule {}
