import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { TaxAgentRequest } from './auth.types';

@Injectable()
export class BootstrapGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.TAXAGENT_BOOTSTRAP_TOKEN;
    if (!expected) throw new ServiceUnavailableException('Bootstrap management plane is disabled');
    const request = context.switchToHttp().getRequest<TaxAgentRequest>();
    const raw = request.headers['x-taxagent-bootstrap-token'];
    const provided = Array.isArray(raw) ? raw[0] : raw;
    if (!provided) throw new UnauthorizedException('Bootstrap token required');
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Invalid bootstrap token');
    return true;
  }
}
