import { Body, Controller, Get, Post, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { RequireScope } from '../auth/require-scope.decorator';
import { CanonicalRegularCalculationDto, CanonicalSimplesCalculationDto } from './canonical-rtc.dto';
import { RegularSimulatorBatchDto, SimplesSimulatorBatchDto } from './simulator-batch.dto';
import { SimulatorBatchService } from './simulator-batch.service';
import { RtcBatchService } from './rtc-batch.service';
import { RtcBatchUploadedFile } from './rtc-batch-file.parser';

@ApiTags('rtc-simulator')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('rtc/simulator')
export class SimulatorBatchController {
  constructor(private readonly simulator: SimulatorBatchService, private readonly files: RtcBatchService) {}

  @Get('readiness')
  @RequireScope('tax:read')
  @ApiOperation({ summary: 'Inspect simulator/batch readiness without performing a fiscal calculation' })
  readiness() {
    return this.simulator.readiness();
  }

  @Post('regular/validate')
  @RequireScope('tax:resolve')
  @ApiOperation({ summary: 'Validate a canonical regular NFS-e simulation input without calling the RTC engine' })
  validateRegular(@Body() dto: CanonicalRegularCalculationDto) {
    return this.simulator.validateRegular(dto);
  }

  @Post('simples/validate')
  @RequireScope('tax:resolve')
  @ApiOperation({ summary: 'Validate a canonical Simples simulation input without calling the RTC engine' })
  validateSimples(@Body() dto: CanonicalSimplesCalculationDto) {
    return this.simulator.validateSimples(dto);
  }

  @Post('regular/batch')
  @RequireScope('tax:resolve')
  @ApiOperation({ summary: 'Validate or calculate up to 100 regular NFS-e rows with per-row fail-closed outcomes' })
  regularBatch(@Body() dto: RegularSimulatorBatchDto, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    if (!auth?.companyId) throw new UnauthorizedException('Authenticated company context required');
    return this.simulator.regularBatch(auth.companyId, auth.environment, dto);
  }

  @Post('regular/batch-file')
  @RequireScope('tax:resolve')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary', description: 'CSV or XLSX. Max 2 MiB / 100 data rows. Formulas, macros and external embedded content are refused.' } } } })
  @ApiOperation({ summary: 'Calculate up to 100 regular NFS-e rows imported from a bounded CSV/XLSX file' })
  regularBatchFile(@UploadedFile() file: RtcBatchUploadedFile | undefined, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    if (!auth?.companyId) throw new UnauthorizedException('Authenticated company context required');
    return this.files.regular(auth.companyId, auth.environment, file);
  }

  @Post('simples/batch-file')
  @RequireScope('tax:resolve')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary', description: 'CSV or XLSX. Max 2 MiB / 100 data rows. Formulas, macros and external embedded content are refused.' } } } })
  @ApiOperation({ summary: 'Calculate up to 100 Simples NF-e/NFC-e rows imported from a bounded CSV/XLSX file' })
  simplesBatchFile(@UploadedFile() file: RtcBatchUploadedFile | undefined, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    if (!auth?.companyId) throw new UnauthorizedException('Authenticated company context required');
    return this.files.simples(auth.companyId, auth.environment, file);
  }

  @Post('simples/batch')
  @RequireScope('tax:resolve')
  @ApiOperation({ summary: 'Validate or calculate up to 100 Simples NF-e/NFC-e rows with per-row fail-closed outcomes' })
  simplesBatch(@Body() dto: SimplesSimulatorBatchDto, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    if (!auth?.companyId) throw new UnauthorizedException('Authenticated company context required');
    return this.simulator.simplesBatch(auth.companyId, auth.environment, dto);
  }
}
