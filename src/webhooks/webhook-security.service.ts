import { BadRequestException, Injectable } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface SafeWebhookTarget { url: URL; address: string; family: number }

@Injectable()
export class WebhookSecurityService {
  async assertSafe(rawUrl: string): Promise<SafeWebhookTarget> {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') throw new BadRequestException('Webhook URL must use HTTPS');
    if (url.username || url.password) throw new BadRequestException('Webhook URL must not contain credentials');
    if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) throw new BadRequestException('Local webhook destinations are not allowed');
    const addresses = isIP(url.hostname) ? [{ address: url.hostname, family: isIP(url.hostname) }] : await lookup(url.hostname, { all: true });
    if (!addresses.length) throw new BadRequestException('Webhook hostname did not resolve');
    for (const entry of addresses) if (this.isPrivate(entry.address)) throw new BadRequestException('Private or loopback webhook destinations are not allowed');
    return { url, address: addresses[0].address, family: addresses[0].family };
  }
  private isPrivate(address: string): boolean {
    const normalized = address.toLowerCase();
    if (normalized.startsWith('::ffff:')) return this.isPrivate(normalized.slice(7));
    if (normalized.includes(':')) return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
    const octets = normalized.split('.').map(Number); if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const [a, b] = octets; return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
}
