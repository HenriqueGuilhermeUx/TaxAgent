import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { NexOfficePartnerGuard } from '../customer-portal/nexoffice-partner.guard';
import { DocumentEvidenceService } from './document-evidence.service';

@ApiTags('nexoffice-evidence-partner')
@ApiHeader({ name: 'X-TaxAgent-NexOffice-Key', required: true })
@UseGuards(NexOfficePartnerGuard)
@Controller('partners/nexoffice/companies/:companyId/evidence')
export class NexOfficeEvidenceController {
  constructor(private readonly evidence: DocumentEvidenceService) {}

  @Get()
  overview(@Param('companyId') companyId: string, @Query('environment') raw?: string) {
    return this.evidence.overview(companyId, this.environment(raw ?? 'test'));
  }

  @Get('regulatory-changes')
  regulatoryChanges(@Param('companyId') companyId: string) {
    return this.evidence.regulatoryChanges(companyId);
  }

  @Get('dossier')
  dossier(@Param('companyId') companyId: string, @Query('period') period: string, @Query('environment') raw?: string) {
    if (!/^\d{4}-\d{2}$/.test(period ?? '')) throw new BadRequestException('period must use YYYY-MM');
    return this.evidence.dossier(companyId, this.environment(raw ?? 'test'), period);
  }

  private environment(value: string): FiscalEnvironment {
    if (value !== 'test' && value !== 'production') throw new BadRequestException('environment must be test or production');
    return value;
  }
}
