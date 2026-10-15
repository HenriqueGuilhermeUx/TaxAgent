import { Controller, Get, Header } from '@nestjs/common';
import { evidencePortalHtml } from './evidence-portal.page';

@Controller('evidence')
export class EvidencePortalPageController {
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  page() { return evidencePortalHtml(); }
}
