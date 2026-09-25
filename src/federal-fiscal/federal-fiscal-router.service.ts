import { Injectable } from '@nestjs/common';
import { FiscalEngineError } from '../fiscal-core/fiscal-engine.error';
import { FederalFiscalCapability, FederalFiscalProvider, FederalFiscalRequest, FederalFiscalResult } from './federal-fiscal-provider.interface';

@Injectable()
export class FederalFiscalRouterService {
  constructor(private readonly providers: FederalFiscalProvider[] = []) {}

  async resolve(capability: FederalFiscalCapability): Promise<FederalFiscalProvider> {
    for (const provider of this.providers) {
      if (await provider.canHandle(capability)) return provider;
    }
    throw new FiscalEngineError(
      'TA_FEDERAL_FISCAL_PROVIDER_REQUIRED',
      `No verified federal fiscal provider is configured for capability ${capability}`,
      false,
      { capability, transmission_attempted: false },
    );
  }

  async execute(request: FederalFiscalRequest): Promise<FederalFiscalResult> {
    const provider = await this.resolve(request.capability);
    return provider.execute(request);
  }
}
