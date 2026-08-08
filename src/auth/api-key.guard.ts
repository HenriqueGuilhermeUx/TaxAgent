import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { TaxAgentRequest } from './auth.types';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly keys: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.TAXAGENT_AUTH_MODE === 'off' && process.env.NODE_ENV !== 'production') return true;
    const request = context.switchToHttp().getRequest<TaxAgentRequest>();
    const raw = request.headers.authorization;
    const authorization = Array.isArray(raw) ? raw[0] : raw;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Bearer API key required');
    const auth = await this.keys.authenticate(authorization.slice(7).trim());
    if (!auth) throw new UnauthorizedException('Invalid or revoked API key');
    request.taxAgentAuth = auth;
    return true;
  }
}
