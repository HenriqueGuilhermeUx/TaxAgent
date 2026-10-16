import { Controller, Get, Header } from '@nestjs/common';
import { commercialPilotOperationsHtml } from './commercial-pilot.page';

@Controller('commercial/pilots')
export class CommercialPilotPageController {
  @Get()
  @Header('Content-Type','text/html; charset=utf-8')
  page(){ return commercialPilotOperationsHtml(); }
}
