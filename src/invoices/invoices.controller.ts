import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoicesService } from './invoices.service';

@ApiTags('invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Create a fiscal invoice operation' })
  @ApiResponse({ status: 202, description: 'Invoice accepted for fiscal processing' })
  create(@Body() dto: CreateInvoiceDto) {
    return this.invoices.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice state and fiscal ledger' })
  findOne(@Param('id') id: string) {
    return this.invoices.findOne(id);
  }
}
