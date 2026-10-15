import { Injectable } from '@nestjs/common';
import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';
import { GissClient } from './giss.client';

export interface GissRpsIdentity { cityCode: string; providerTaxId: string; municipalRegistration?: string | null; number: string; series: string }
export type GissReconciliation = { state: 'authorized'; nfseNumber: string; verificationCode?: string; raw?: unknown } | { state: 'not_found' } | { state: 'unknown'; reason: string };

@Injectable()
export class GissReconciliationService {
  constructor(private readonly client: GissClient) {}

  async beforeIssue(identity: GissRpsIdentity): Promise<GissReconciliation> {
    // Never retransmit an RPS unless a provider query has proved that the same
    // provider/series/number identity is absent. Query transport is deliberately
    // locked until the municipal SOAP contract is validated end-to-end.
    void identity;
    throw new FiscalEngineError(
      'TA_GISS_RECONCILIATION_REQUIRED',
      'GISS issuance remains blocked until ConsultarNfsePorRps is validated. TaxAgent will not POST or retry an RPS without provider-side reconciliation.',
      false,
      { provider: 'giss', transmission_attempted: false, reconciliation_required: true },
    );
  }
}
