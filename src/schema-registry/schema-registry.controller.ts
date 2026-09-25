import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SchemaRegistryService } from './schema-registry.service';

@ApiTags('schemas')
@Controller('schemas')
export class SchemaRegistryController {
  constructor(private readonly registry: SchemaRegistryService) {}

  @Get('registry')
  getRegistry() {
    return this.registry.metadata();
  }
}
