import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RequireScope } from '../auth/require-scope.decorator';
import { DocumentIntakeService } from './document-intake.service';
import { DocumentIntakeRequest } from './document-intake.types';

@ApiTags('document-intake')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@RequireScope('documents:write')
@Controller('documents')
export class DocumentIntakeController {
  constructor(private readonly intake: DocumentIntakeService) {}

  @Post('extract')
  extract(@Body() body: DocumentIntakeRequest) {
    return this.intake.extract(body);
  }
}
