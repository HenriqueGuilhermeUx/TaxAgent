import { Injectable } from '@nestjs/common';
import { FiscalEngineError } from './fiscal-engine.error';
import { MunicipalCapabilityService } from '../municipal-parameters/municipal-capability.service';
import { NfseNationalProvider } from '../providers/nfse-national/nfse-national.provider';
import { GissProvider } from '../providers/giss/giss.provider';
import { PlugNotasProvider } from '../providers/plugnotas/plugnotas.provider';
import { FiscalProvider } from './fiscal-provider.interface';
import { FiscalContext } from './fiscal.types';

@Injectable()
export class FiscalRouterService {
  constructor(
    private readonly nfseNational: NfseNationalProvider,
    private readonly capabilities: MunicipalCapabilityService,
    private readonly giss: GissProvider,
    private readonly plugnotas: PlugNotasProvider,
  ) {}

  async resolve(context: FiscalContext): Promise<FiscalProvider> {
    const capability = await this.capabilities.resolve(context.issuerCityCode, context.environment, { taxRegime: context.taxRegime, effectiveAt: context.effectiveAt });

    // Native verified routes always win. A gateway is a fallback, never a reason to
    // bypass an official National Public Issuer route or a TaxAgent native adapter.
    if (capability.route === 'national-direct') return this.nfseNational;
    if (capability.route === 'municipal-provider' && capability.provider === 'giss') return this.giss;

    // Long-tail municipal coverage: only return the gateway after its own live
    // capability lookup proves that the municipality exists in the configured environment.
    // PlugNotasProvider itself remains transmission-locked until issuer onboarding is verified.
    if (await this.plugnotas.canHandle(context)) return this.plugnotas;

    if (capability.route === 'municipal-provider') {
      throw new FiscalEngineError(
        'TA_MUNICIPAL_PROVIDER_REQUIRED',
        `Municipality ${context.issuerCityCode} uses municipal provider ${capability.provider}; no verified TaxAgent native or gateway route is configured`,
        false,
        capability,
      );
    }

    throw new FiscalEngineError(
      'TA_MUNICIPAL_ROUTE_UNVERIFIED',
      `Municipality ${context.issuerCityCode} has no verified direct National Public Issuer, native municipal adapter, or configured gateway route; transmission is blocked`,
      false,
      capability,
    );
  }
}
