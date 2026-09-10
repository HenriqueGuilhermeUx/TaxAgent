import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';
import { DpsPreflightService } from './dps-preflight.service';
import { ReadinessService } from './readiness.service';

@Injectable()
export class NoA1HomologationService {
  constructor(
    private readonly readiness: ReadinessService,
    private readonly dpsPreflight: DpsPreflightService,
  ) {}

  async validate(dto: CreateInvoiceDto) {
    if (dto.environment !== 'test') {
      throw new BadRequestException('No-A1 homologation track is restricted to environment=test');
    }

    const readiness = await this.readiness.report(dto.company_id, 'test');
    const prebuild = await this.dpsPreflight.prebuild(dto);

    const failedBeforeCertificate = Array.isArray(readiness.failedBlockingGatesBeforeCertificate)
      ? readiness.failedBlockingGatesBeforeCertificate
      : [];
    const remainingCertificateGates = Array.isArray(readiness.remainingCertificateGates)
      ? readiness.remainingCertificateGates
      : [];

    return {
      valid: failedBeforeCertificate.length === 0 && prebuild.valid === true,
      track: 'no-a1',
      environment: 'test',
      transmitted: false,
      transmission_possible: false,
      certificate_used: false,
      certificate_required_for_next_stage: true,
      ready_without_certificate: readiness.readyWithoutCertificate === true,
      failed_before_certificate: failedBeforeCertificate,
      remaining_certificate_gates: remainingCertificateGates,
      dps: {
        valid: prebuild.valid,
        signed: prebuild.signed,
        dps_id: prebuild.dps_id,
        schema: prebuild.schema,
        unsigned_xml_sha256: prebuild.unsigned_xml_sha256,
        tax_decision_id: prebuild.tax_decision_id,
        fiscal_summary: prebuild.fiscal_summary,
      },
      next_stage: failedBeforeCertificate.length === 0
        ? 'Provide an A1 bound to the Company CNPJ, sign the exact DPS and run the full non-transmitting dry-run.'
        : 'Resolve the failed pre-certificate gates before providing an A1.',
      checked_at: new Date().toISOString(),
      note: 'This track never loads certificate material, never signs XML and never calls SEFIN. It proves the fiscal decision, DPS build and official XSD path before an A1 is available.',
    };
  }
}
