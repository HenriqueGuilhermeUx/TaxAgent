import { Injectable } from '@nestjs/common';
import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';
import { FiscalProvider } from '../../fiscal-core/fiscal-provider.interface';
import { gissEndpointPolicy } from './giss-endpoints';
import { GissClient } from './giss.client';
import { CancelFiscalInput, CanonicalInvoiceInput, EventResult, FiscalContext, FiscalOperationContext, IssueResult } from '../../fiscal-core/fiscal.types';

@Injectable()
export class GissProvider implements FiscalProvider {
  readonly name = 'giss';
  constructor(private readonly client: GissClient) {}

  async canHandle(context: FiscalContext): Promise<boolean> {
    return context.issuerCityCode === '3548500';
  }

  async issue(_input: CanonicalInvoiceInput, _operation: FiscalOperationContext): Promise<IssueResult> {
    // Deliberately no SOAP POST here yet. The client remains transmission-locked until
    // ABRASF signing/authentication and reconciliation are validated end-to-end.
    throw new FiscalEngineError(
      'TA_GISS_INTEGRATION_NOT_CONFIGURED',
      'Santos requires the municipal GISS/GINFES route. TaxAgent has resolved the provider, but live transmission remains blocked until the municipality/provider integration contract and credentials are configured.',
      false,
      { provider: this.name, city_code: '3548500', endpoint: gissEndpointPolicy('3548500'), transmission_attempted: false },
    );
  }

  async cancel(_input: CancelFiscalInput, _operation: FiscalOperationContext): Promise<EventResult> {
    throw new FiscalEngineError(
      'TA_GISS_INTEGRATION_NOT_CONFIGURED',
      'Santos cancellation requires the municipal GISS/GINFES integration. No external request was sent.',
      false,
      { provider: this.name, city_code: '3548500', endpoint: gissEndpointPolicy('3548500'), transmission_attempted: false },
    );
  }
}
