import { BadRequestException, Injectable } from '@nestjs/common';
import { CertificateVaultService } from '../certificates/certificate-vault.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { GissClient } from '../providers/giss/giss.client';

@Injectable()
export class GissWsdlDiagnosticService {
  constructor(private readonly vault: CertificateVaultService, private readonly giss: GissClient) {}

  async inspect(companyId: string, environment: FiscalEnvironment, cityCode: string) {
    if (environment !== 'test') throw new BadRequestException('GISS WSDL diagnostic is restricted to the test environment');
    const material = await this.vault.getActiveMaterial(companyId);
    const result = await this.giss.inspectWsdl(cityCode, material);
    return {
      ...result,
      environment,
      city_code: cityCode,
      certificate_fingerprint: material.fingerprint,
      network_method: 'GET',
      fiscal_transmission_attempted: false,
    };
  }
}
