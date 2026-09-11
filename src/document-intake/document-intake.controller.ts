import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { RequireScope } from '../auth/require-scope.decorator';
import { DocumentIntakeService } from './document-intake.service';
import { DocumentIntakeApprovalRequest, DocumentIntakeRequest } from './document-intake.types';

@ApiTags('document-intake')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('documents')
export class DocumentIntakeController {
  constructor(private readonly intake: DocumentIntakeService) {}

  @Post('extract')
  @RequireScope('documents:write')
  extract(@Body() body: DocumentIntakeRequest, @CurrentTaxAgentAuth() auth: TaxAgentAuthContext) {
    return this.intake.extract(body, auth.companyId, auth.environment);
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
}
