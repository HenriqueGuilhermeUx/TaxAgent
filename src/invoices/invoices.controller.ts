import { Body, Controller, ForbiddenException, Get, Headers, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { CancelInvoiceDto } from './dto/cancel-invoice.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoicesService } from './invoices.service';

@ApiTags('invoices') @ApiBearerAuth() @UseGuards(ApiKeyGuard) @Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}
  @Post() @HttpCode(HttpStatus.ACCEPTED) @ApiHeader({ name: 'Idempotency-Key', required: false }) @ApiOperation({ summary: 'Create a fiscal invoice operation' }) @ApiResponse({ status: 202, description: 'Invoice accepted for durable fiscal processing' })
  create(@Body() dto: CreateInvoiceDto, @Headers('idempotency-key') idempotencyKey: string | undefined, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { if (auth && auth.companyId !== dto.company_id) throw new ForbiddenException('API key cannot operate another company'); if (auth && auth.environment !== dto.environment) throw new ForbiddenException('API key environment does not match request environment'); return this.invoices.create(dto, idempotencyKey); }
  @Get(':id') @ApiOperation({ summary: 'Get invoice state and fiscal ledger' }) findOne(@Param('id') id: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { return this.invoices.findOneForCompany(id, auth?.companyId); }
  @Post(':id/cancel') @HttpCode(HttpStatus.ACCEPTED) @ApiOperation({ summary: 'Request NFS-e cancellation through a fiscal event' }) cancel(@Param('id') id: string, @Body() dto: CancelInvoiceDto, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) { return this.invoices.requestCancellation(id, auth?.companyId, dto); }
}
