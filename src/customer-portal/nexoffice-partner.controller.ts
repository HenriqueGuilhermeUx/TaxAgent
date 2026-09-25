import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CertificateVaultService } from '../certificates/certificate-vault.service';
import { UploadCertificateDto } from '../certificates/dto/upload-certificate.dto';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { CancelInvoiceDto } from '../invoices/dto/cancel-invoice.dto';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';
import { InvoicesService } from '../invoices/invoices.service';
import { EnrollPilotDto } from '../operations/dto/enroll-pilot.dto';
import { PilotEnrollmentService } from '../operations/pilot-enrollment.service';
import { UpsertProviderCredentialsDto } from '../provider-credentials/dto/upsert-provider-credentials.dto';
import { ProviderCredentialsService } from '../provider-credentials/provider-credentials.service';
import { CustomerFiscalService } from './customer-fiscal.service';
import { UpdateCustomerFiscalProfileDto } from './dto/update-customer-fiscal-profile.dto';
import { NexOfficePartnerGuard } from './nexoffice-partner.guard';

@ApiTags('nexoffice-partner')
@ApiHeader({ name: 'X-TaxAgent-NexOffice-Key', required: true })
@UseGuards(NexOfficePartnerGuard)
@Controller('partners/nexoffice')
export class NexOfficePartnerController {
  constructor(
    private readonly enrollment: PilotEnrollmentService,
    private readonly fiscal: CustomerFiscalService,
    private readonly certificates: CertificateVaultService,
    private readonly credentials: ProviderCredentialsService,
    private readonly invoices: InvoicesService,
  ) {}

  @Post('provision')
  @ApiOperation({ summary: 'Server-to-server provision or reuse a TaxAgent Company for a NexOffice workspace and create an initial safe assessment' })
  @ApiQuery({ name: 'environment', required: false, enum: ['test', 'production'] })
  async provision(@Body() dto: EnrollPilotDto, @Query('environment') rawEnvironment?: string) {
    const environment = this.environment(rawEnvironment ?? 'test');
    const result = await this.enrollment.enroll({ ...dto, pilot_label: dto.pilot_label ?? 'NexOffice', source: dto.source ?? 'nexoffice' }, environment);
    return { company: result.company, environment, fiscal_status: result.pilot_status, route: result.route, blockers: result.blockers, checklist: result.checklist, next_actions: result.next_actions, safeguards: result.safeguards };
  }

  @Get('companies/:companyId/fiscal')
  @ApiOperation({ summary: 'Read the customer-safe fiscal journey for the mapped NexOffice company' })
  @ApiQuery({ name: 'environment', required: false, enum: ['test', 'production'] })
  status(@Param('companyId') companyId: string, @Query('environment') rawEnvironment?: string, @Query('effective_at') effectiveAt?: string) {
    return this.fiscal.status(companyId, this.environment(rawEnvironment ?? 'test'), effectiveAt);
  }

  @Post('companies/:companyId/fiscal/profile')
  @ApiOperation({ summary: 'Update non-secret fiscal profile fields through the NexOffice server integration' })
  @ApiQuery({ name: 'environment', required: false, enum: ['test', 'production'] })
  updateProfile(@Param('companyId') companyId: string, @Body() dto: UpdateCustomerFiscalProfileDto, @Query('environment') rawEnvironment?: string, @Query('effective_at') effectiveAt?: string) {
    return this.fiscal.updateProfile(companyId, this.environment(rawEnvironment ?? 'test'), dto, effectiveAt);
  }

  @Post('companies/:companyId/fiscal/advance')
  @ApiOperation({ summary: 'Safely reassess and run non-emitting preflight when the NexOffice company is locally ready' })
  @ApiQuery({ name: 'environment', required: false, enum: ['test', 'production'] })
  advance(@Param('companyId') companyId: string, @Query('environment') rawEnvironment?: string, @Query('effective_at') effectiveAt?: string) {
    return this.fiscal.advance(companyId, this.environment(rawEnvironment ?? 'test'), effectiveAt);
  }

  @Post('companies/:companyId/certificate')
  @ApiOperation({ summary: 'Forward an A1 into the TaxAgent Certificate Vault; secret material is never returned' })
  async certificate(@Param('companyId') companyId: string, @Body() dto: UploadCertificateDto) {
    const stored = await this.certificates.store(companyId, dto.pfx_base64, dto.password);
    return { ...stored, secret_material_returned: false };
  }

  @Post('companies/:companyId/provider-credentials')
  @ApiOperation({ summary: 'Store provider credentials in the encrypted TaxAgent credential vault for a NexOffice company' })
  providerCredentials(@Param('companyId') companyId: string, @Body() dto: UpsertProviderCredentialsDto) {
    return this.credentials.store(companyId, dto.provider, dto.environment, dto.credentials, dto.note);
  }

  @Post('invoices')
  @ApiOperation({ summary: 'Partner invoice endpoint compatible with the NexOffice governed outbox; TaxAgent safety gates remain authoritative' })
  createPartnerInvoice(@Body() dto: CreateInvoiceDto, @Headers('idempotency-key') idempotencyKey?: string) {
    return this.invoices.create(dto, idempotencyKey);
  }

  @Post('companies/:companyId/invoices')
  @ApiOperation({ summary: 'Accept an invoice operation from NexOffice after NexOffice governance/approval; TaxAgent safety gates remain authoritative' })
  createInvoice(@Param('companyId') companyId: string, @Body() dto: CreateInvoiceDto, @Headers('idempotency-key') idempotencyKey?: string) {
    if (dto.company_id !== companyId) throw new BadRequestException('company_id must match partner route companyId');
    return this.invoices.create(dto, idempotencyKey);
  }

  @Get('companies/:companyId/invoices/:invoiceId')
  @ApiOperation({ summary: 'Read one TaxAgent invoice state for the mapped NexOffice company' })
  invoice(@Param('companyId') companyId: string, @Param('invoiceId') invoiceId: string) {
    return this.invoices.findOneForCompany(invoiceId, companyId);
  }

  @Post('companies/:companyId/invoices/:invoiceId/cancel')
  @ApiOperation({ summary: 'Request cancellation for a mapped NexOffice company; TaxAgent event safety rules remain authoritative' })
  cancel(@Param('companyId') companyId: string, @Param('invoiceId') invoiceId: string, @Body() dto: CancelInvoiceDto) {
    return this.invoices.requestCancellation(invoiceId, companyId, dto);
  }

  private environment(value: string): FiscalEnvironment {
    if (value !== 'test' && value !== 'production') throw new BadRequestException('environment must be test or production');
    return value;
  }
}
