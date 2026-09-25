import { CancelFiscalInput, CanonicalInvoiceInput, EventResult, FiscalContext, FiscalOperationContext, IssueResult } from './fiscal.types';

export interface FiscalProvider {
  readonly name: string;
  canHandle(context: FiscalContext): Promise<boolean>;
  issue(input: CanonicalInvoiceInput, operation: FiscalOperationContext): Promise<IssueResult>;
  cancel(input: CancelFiscalInput, operation: FiscalOperationContext): Promise<EventResult>;
}
