export type FederalFiscalCapability =
  | 'simples'
  | 'mei'
  | 'tax_status'
  | 'certificate'
  | 'dctfweb'
  | 'reinf'
  | 'ecac_mailbox'
  | 'power_of_attorney';

export interface FederalFiscalRequest {
  companyId: string;
  taxpayerTaxId: string;
  capability: FederalFiscalCapability;
  operation: string;
  payload?: unknown;
}

export interface FederalFiscalResult {
  provider: string;
  capability: FederalFiscalCapability;
  operation: string;
  status: 'completed' | 'pending' | 'rejected';
  providerReference?: string;
  raw?: unknown;
}

export interface FederalFiscalProvider {
  readonly name: string;
  canHandle(capability: FederalFiscalCapability): Promise<boolean>;
  execute(request: FederalFiscalRequest): Promise<FederalFiscalResult>;
}
