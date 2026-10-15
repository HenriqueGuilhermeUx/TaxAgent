import { Controller, Get, Header } from '@nestjs/common';
import { customerHomeHtml, customerPortalHtml } from './customer-portal.page';

@Controller()
export class CustomerPortalPageController {
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  home() { return customerHomeHtml(); }

  @Get('portal')
  @Header('Content-Type', 'text/html; charset=utf-8')
  portal() { return customerPortalHtml(); }
}
