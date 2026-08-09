import { Controller, Get, Header, NotFoundException } from '@nestjs/common';
import { homologationConsoleHtml } from './homologation-console.page';

@Controller('homologation')
export class HomologationConsoleController {
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('X-Frame-Options', 'DENY')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
  page(): string {
    if (process.env.TAXAGENT_HOMOLOGATION_CONSOLE_ENABLED !== 'true') {
      throw new NotFoundException();
    }
    return homologationConsoleHtml();
  }
}
