import { Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { BootstrapGuard } from './bootstrap.guard';

@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeyGuard, BootstrapGuard],
  exports: [ApiKeysService, ApiKeyGuard, BootstrapGuard],
})
export class AuthModule {}
