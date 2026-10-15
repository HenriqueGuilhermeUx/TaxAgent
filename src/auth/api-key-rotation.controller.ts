import { Controller, ForbiddenException, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeysService } from './api-keys.service';
import { TaxAgentAuthContext } from './auth.types';
import { CurrentTaxAgentAuth } from './current-auth.decorator';

@ApiTags('api-keys')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('api-keys')
export class ApiKeyRotationController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get('current')
  @ApiOperation({ summary: 'Inspect the authenticated API key context without exposing the key secret' })
  current(@CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    if (!auth) throw new ForbiddenException('API key authentication is required');
    return {
      key_id: auth.keyId,
      company_id: auth.companyId,
      environment: auth.environment,
      scopes: auth.scopes,
      key_secret_exposed: false,
    };
  }

  @Post('rotate-current')
  @ApiHeader({ name: 'X-TaxAgent-Key-Rotation-Confirmation', required: true, example: 'ROTATE-CURRENT-KEY' })
  @ApiOperation({ summary: 'Atomically replace the currently authenticated API key and return the new secret exactly once' })
  rotateCurrent(
    @Headers('x-taxagent-key-rotation-confirmation') confirmation: string | undefined,
    @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext,
  ) {
    if (!auth) throw new ForbiddenException('API key authentication is required');
    if (confirmation !== 'ROTATE-CURRENT-KEY') throw new ForbiddenException('Exact key rotation confirmation header is required');
    return this.keys.rotateCurrent(auth, 'Rotated after credential exposure');
  }
}
