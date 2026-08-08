export type FiscalEnvironment = 'test' | 'production';
export type InvoiceStatus = 'queued' | 'processing' | 'authorized' | 'rejected' | 'cancelled';

export interface CanonicalCustomer {
  taxId: string;
  name: string;
  cityCode: string;
}

export interface CanonicalService {
  description: string;
  amount: number;
  nationalServiceCode?: string;
  operationIndicator?: string;
  taxClassification?: string;
}

export interface CanonicalInvoiceInput {
  companyId: string;
  environment: FiscalEnvironment;
  customer: CanonicalCustomer;
  service: CanonicalService;
}

export interface FiscalContext {
  companyId: string;
  environment: FiscalEnvironment;
  customerCityCode: string;
}

export interface IssueResult {
  status: 'authorized' | 'rejected';
  provider: string;
  accessKey?: string;
  providerReference?: string;
  raw?: unknown;
  rejection?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}
