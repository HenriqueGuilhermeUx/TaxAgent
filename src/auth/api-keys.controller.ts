import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { BootstrapGuard } from './bootstrap.guard';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@ApiTags('api-keys')
@ApiHeader({ name: 'X-TaxAgent-Bootstrap-Token', required: true })
@UseGuards(BootstrapGuard)
@Controller('companies/:companyId/api-keys')
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Post()
  create(@Param('companyId') companyId: string, @Body() dto: CreateApiKeyDto) {
    return this.keys.create(companyId, dto.name, dto.environment, dto.scopes);
  }

  @Delete(':keyId')
  revoke(@Param('companyId') companyId: string, @Param('keyId') keyId: string) {
    return this.keys.revoke(companyId, keyId);
  }
}
