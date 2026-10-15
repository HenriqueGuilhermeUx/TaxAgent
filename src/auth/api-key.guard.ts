import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeysService } from './api-keys.service';
import { TaxAgentRequest } from './auth.types';
import { TAXAGENT_SCOPES } from './require-scope.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly keys: ApiKeysService, private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.TAXAGENT_AUTH_MODE === 'off' && process.env.NODE_ENV !== 'production') return true;
    const request = context.switchToHttp().getRequest<TaxAgentRequest>();
    const raw = request.headers.authorization;
    const authorization = Array.isArray(raw) ? raw[0] : raw;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Bearer API key required');
    const auth = await this.keys.authenticate(authorization.slice(7).trim());
    if (!auth) throw new UnauthorizedException('Invalid or revoked API key');
    const required = this.reflector.getAllAndOverride<string[]>(TAXAGENT_SCOPES, [context.getHandler(), context.getClass()]) ?? [];
    if (required.length && !auth.scopes.includes('*') && required.some((scope) => !auth.scopes.includes(scope))) throw new ForbiddenException(`API key missing required scope: ${required.join(', ')}`);
    request.taxAgentAuth = auth;
    return true;
  }
}
