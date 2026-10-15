import { Module } from '@nestjs/common';
import { SchemaRegistryController } from './schema-registry.controller';
import { SchemaRegistryService } from './schema-registry.service';

@Module({
  controllers: [SchemaRegistryController],
  providers: [SchemaRegistryService],
  exports: [SchemaRegistryService],
})
export class SchemaRegistryModule {}
