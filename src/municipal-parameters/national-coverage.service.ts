import { Injectable } from '@nestjs/common';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { MunicipalCapabilityService } from './municipal-capability.service';

@Injectable()
export class NationalCoverageService {
  constructor(private readonly capabilities: MunicipalCapabilityService) {}

  async supports(
    cityCode: string,
    environment: FiscalEnvironment,
    taxpayer: { taxRegime?: string; effectiveAt?: string } = {},
  ): Promise<boolean> {
    const capability = await this.capabilities.resolve(cityCode, environment, taxpayer);
    return capability.route === 'national-direct'
      && capability.provider === 'nfse-national'
      && capability.nationalPublicIssuer === true;
  }
}
