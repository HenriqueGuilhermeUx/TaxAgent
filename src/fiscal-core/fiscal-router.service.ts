import { Injectable } from '@nestjs/common';
import { FiscalEngineError } from './fiscal-engine.error';
import { MunicipalCapabilityService } from '../municipal-parameters/municipal-capability.service';
import { NfseNationalProvider } from '../providers/nfse-national/nfse-national.provider';
import { GissProvider } from '../providers/giss/giss.provider';
import { FiscalProvider } from './fiscal-provider.interface';
import { FiscalContext } from './fiscal.types';

@Injectable()
export class FiscalRouterService {
  constructor(
    private readonly nfseNational: NfseNationalProvider,
    private readonly capabilities: MunicipalCapabilityService,
    private readonly giss: GissProvider,
  ) {}

  async resolve(context: FiscalContext): Promise<FiscalProvider> {
    const capability = await this.capabilities.resolve(context.issuerCityCode, context.environment, { taxRegime: context.taxRegime, effectiveAt: context.effectiveAt });

    if (capability.route === 'national-direct') return this.nfseNational;

    if (capability.route === 'municipal-provider' && capability.provider === 'giss') return this.giss;

    if (capability.route === 'municipal-provider') {
      throw new FiscalEngineError(
        'TA_MUNICIPAL_PROVIDER_REQUIRED',
        `Municipality ${context.issuerCityCode} uses municipal provider ${capability.provider}; direct SEFIN transmission is blocked by Fiscal Router`,
        false,
        capability,
      );
    }

    throw new FiscalEngineError(
      'TA_MUNICIPAL_ROUTE_UNVERIFIED',
      `Municipality ${context.issuerCityCode} participates in the national parameters ecosystem, but National Public Issuer capability is not proven; transmission is blocked until an official route is resolved`,
      false,
      capability,
    );
  }
}
