import { Injectable } from '@nestjs/common';
import { NfseNationalProvider } from '../providers/nfse-national/nfse-national.provider';
import { FiscalProvider } from './fiscal-provider.interface';
import { FiscalContext } from './fiscal.types';

@Injectable()
export class FiscalRouterService {
  constructor(private readonly nfseNational: NfseNationalProvider) {}

  async resolve(context: FiscalContext): Promise<FiscalProvider> {
    const providers: FiscalProvider[] = [this.nfseNational];

    for (const provider of providers) {
      if (await provider.canHandle(context)) return provider;
    }

    throw new Error('No fiscal provider available for this operation');
  }
}
