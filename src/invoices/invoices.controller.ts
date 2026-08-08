import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoicesService } from './invoices.service';

@ApiTags('invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({ summary: 'Create a fiscal invoice operation' })
  @ApiResponse({ status: 202, description: 'Invoice accepted for durable fiscal processing' })
  create(@Body() dto: CreateInvoiceDto, @Headers('idempotency-key') idempotencyKey?: string) {
    return this.invoices.create(dto, idempotencyKey);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice state and fiscal ledger' })
  findOne(@Param('id') id: string) {
    return this.invoices.findOne(id);
  }
}
