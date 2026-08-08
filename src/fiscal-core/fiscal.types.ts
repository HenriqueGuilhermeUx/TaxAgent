export type FiscalEnvironment = 'test' | 'production';
export type InvoiceStatus = 'queued' | 'processing' | 'retrying' | 'authorized' | 'cancelling' | 'rejected' | 'cancelled';

export interface CanonicalCustomer { taxId: string; name: string; cityCode: string }
export interface CanonicalService {
  description: string;
  amount: number;
  nationalServiceCode?: string;
  operationIndicator?: string;
  taxSituation?: string;
  taxClassification?: string;
}
export interface CanonicalInvoiceInput {
  companyId: string;
  environment: FiscalEnvironment;
  competence?: string;
  issuedAt?: string;
  customer: CanonicalCustomer;
  service: CanonicalService;
}
export interface FiscalContext {
  companyId: string;
  environment: FiscalEnvironment;
  issuerCityCode: string;
  serviceLocationCityCode: string;
}
export interface FiscalOperationContext { invoiceId: string }
export interface CancelFiscalInput { companyId: string; environment: FiscalEnvironment; accessKey: string; reasonCode: string; reason: string }
export interface EventResult { status: 'registered' | 'rejected'; provider: string; providerReference?: string; raw?: unknown; rejection?: { code: string; message: string; retryable: boolean; category?: string } }
export interface IssueResult { status: 'authorized' | 'rejected'; provider: string; accessKey?: string; providerReference?: string; raw?: unknown; rejection?: { code: string; message: string; retryable: boolean; category?: string } }
