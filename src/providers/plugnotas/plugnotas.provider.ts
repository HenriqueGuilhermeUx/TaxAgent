import { Injectable } from '@nestjs/common';
import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';
import { FiscalProvider } from '../../fiscal-core/fiscal-provider.interface';
import {
  CancelFiscalInput,
  CanonicalInvoiceInput,
  EventResult,
  FiscalContext,
  FiscalOperationContext,
  IssueResult,
} from '../../fiscal-core/fiscal.types';
import { PlugNotasClient } from './plugnotas.client';

@Injectable()
export class PlugNotasProvider implements FiscalProvider {
  readonly name = 'plugnotas';

  constructor(private readonly client: PlugNotasClient) {}

  async canHandle(context: FiscalContext): Promise<boolean> {
    if (!this.client.isConfigured(context.environment)) return false;
    return Boolean(await this.client.getMunicipality(context.environment, context.issuerCityCode));
  }

  async issue(input: CanonicalInvoiceInput, operation: FiscalOperationContext): Promise<IssueResult> {
    throw new FiscalEngineError(
      'TA_PLUGNOTAS_ONBOARDING_REQUIRED',
      'PlugNotas covers this municipality, but issuer onboarding has not been verified; fiscal transmission remains blocked',
      false,
      {
        provider: this.name,
        companyId: input.companyId,
        invoiceId: operation.invoiceId,
        environment: input.environment,
      },
    );
  }

  async cancel(input: CancelFiscalInput, operation: FiscalOperationContext): Promise<EventResult> {
    throw new FiscalEngineError(
      'TA_PLUGNOTAS_ONBOARDING_REQUIRED',
      'PlugNotas cancellation is blocked until issuer onboarding and provider reference ownership are verified',
      false,
      {
        provider: this.name,
        companyId: input.companyId,
        invoiceId: operation.invoiceId,
        environment: input.environment,
      },
    );
  }
}
