import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

@Injectable()
export class NexOfficePartnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = String(process.env.TAXAGENT_NEXOFFICE_KEY ?? '').trim();
    if (!expected) throw new ServiceUnavailableException('NexOffice partner integration is not configured');
    const request = context.switchToHttp().getRequest<{ headers?: Record<string, string | string[] | undefined> }>();
    const raw = request.headers?.['x-taxagent-nexoffice-key'];
    const supplied = Array.isArray(raw) ? raw[0] : String(raw ?? '').trim();
    if (!supplied || !safeEqual(supplied, expected)) throw new UnauthorizedException('Invalid NexOffice partner credential');
    return true;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}
