import { BadRequestException, Injectable } from '@nestjs/common';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

@Injectable()
export class WebhookSecurityService {
  async assertSafe(rawUrl: string): Promise<URL> {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') throw new BadRequestException('Webhook URL must use HTTPS');
    if (url.username || url.password) throw new BadRequestException('Webhook URL must not contain credentials');
    if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) throw new BadRequestException('Local webhook destinations are not allowed');

    const addresses = isIP(url.hostname)
      ? [{ address: url.hostname, family: isIP(url.hostname) }]
      : await lookup(url.hostname, { all: true });
    if (!addresses.length) throw new BadRequestException('Webhook hostname did not resolve');
    for (const entry of addresses) {
      if (this.isPrivate(entry.address)) throw new BadRequestException('Private or loopback webhook destinations are not allowed');
    }
    return url;
  }

  private isPrivate(address: string): boolean {
    if (address.includes(':')) {
      const normalized = address.toLowerCase();
      return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
    }
    const octets = address.split('.').map(Number);
    if (octets.length !== 4) return true;
    const [a, b] = octets;
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
}
