import { Body, Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { RequireScope } from '../auth/require-scope.decorator';
import { DocumentIntakeFileService, IntakeUploadedFile } from './document-intake-file.service';
import { DocumentIntakeService } from './document-intake.service';
import { DocumentIntakeApprovalRequest, DocumentIntakeRequest } from './document-intake.types';
import { PaymentInput, PaymentMatchingService } from './payment-matching.service';

@ApiTags('document-intake')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('documents')
export class DocumentIntakeController {
  constructor(
    private readonly intake: DocumentIntakeService,
    private readonly files: DocumentIntakeFileService,
    private readonly payments: PaymentMatchingService,
  ) {}

  @Post('extract')
  @RequireScope('documents:write')
  extract(@Body() body: DocumentIntakeRequest, @CurrentTaxAgentAuth() auth: TaxAgentAuthContext) {
    return this.intake.extract(body, auth.companyId, auth.environment);
  }

  @Post('intake/upload')
  @RequireScope('documents:write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: {
    file: { type: 'string', format: 'binary', description: 'PDF, PNG, JPEG, XML or TXT. Raw bytes are encrypted at rest.' },
    document_type: { type: 'string', description: 'auto, nfse, invoice, receipt, bank_statement or contract', default: 'auto' },
  } } })
  upload(@UploadedFile() file: IntakeUploadedFile | undefined, @Body('document_type') documentType: string | undefined, @CurrentTaxAgentAuth() auth: TaxAgentAuthContext) {
    return this.files.upload(file, auth.companyId, auth.environment, documentType ?? 'auto');
  }

  @Get('intake/files/:fileId')
  @RequireScope('documents:read')
  getFile(@Param('fileId') fileId: string, @CurrentTaxAgentAuth() auth: TaxAgentAuthContext) {
    return this.files.get(fileId, auth.companyId, auth.environment);
  }

  @Post('intake/files/:fileId/extracted-text')
  @RequireScope('documents:write')
  submitExtractedText(@Param('fileId') fileId: string, @Body() body: { text?: string; document_type?: string }, @CurrentTaxAgentAuth() auth: TaxAgentAuthContext) {
    return this.files.submitExtractedText(fileId, body?.text ?? '', auth.companyId, auth.environment, body?.document_type ?? 'auto');
  }

  @Get('intake/:intakeId')
  @RequireScope('documents:read')
  get(@Param('intakeId') intakeId: string, @CurrentTaxAgentAuth() auth: TaxAgentAuthContext) {
    return this.intake.get(intakeId, auth.companyId, auth.environment);
  }

  @Post('intake/:intakeId/approve')
  @RequireScope('documents:write')
  approve(@Param('intakeId') intakeId: string, @Body() body: DocumentIntakeApprovalRequest, @CurrentTaxAgentAuth() auth: TaxAgentAuthContext) {
    return this.intake.approveAndPost(intakeId, auth.companyId, auth.environment, body);
  }

  @Post('payments')
  @RequireScope('documents:write')
  registerPayment(@Body() body: PaymentInput, @CurrentTaxAgentAuth() auth: TaxAgentAuthContext) {
    return this.payments.registerPayment(auth.companyId, auth.environment, body);
  }

  @Post('intake/:intakeId/payment-matches')
  @RequireScope('documents:read')
  suggestPaymentMatches(@Param('intakeId') intakeId: string, @CurrentTaxAgentAuth() auth: TaxAgentAuthContext) {
    return this.payments.suggest(intakeId, auth.companyId, auth.environment);
  }

  @Post('intake/:intakeId/payment-matches/:paymentId/confirm')
  @RequireScope('documents:write')
  confirmPaymentMatch(@Param('intakeId') intakeId: string, @Param('paymentId') paymentId: string, @CurrentTaxAgentAuth() auth: TaxAgentAuthContext) {
    return this.payments.confirm(intakeId, paymentId, auth.companyId, auth.environment);
  }
}
