export type IntakeSourceType = 'xml' | 'text';
export type IntakeProvider = 'auto' | 'native' | 'docstruct';

export type CanonicalFiscalDocument = {
  schema_version: 'taxagent.document-intake.v1';
  document_type: 'nfse' | 'unknown';
  source_type: IntakeSourceType;
  authority: 'fiscal_xml' | 'unverified_text';
  confidence: number;
  supplier: { tax_id?: string; name?: string };
  customer: { tax_id?: string; name?: string };
  document_number?: string;
  issued_at?: string;
  total?: { amount: number; currency: 'BRL' };
  raw: { sha256: string };
  missing: string[];
  warnings: string[];
  lineage?: {
    provider: string;
    method: string;
    authoritative: boolean;
  };
};

export type DocumentIntakeRequest = {
  source_type: IntakeSourceType;
  content: string;
  document_type?: 'auto' | 'nfse' | 'invoice' | 'receipt' | 'bank_statement' | 'contract';
  provider?: IntakeProvider;
  persist?: boolean;
  send_to_inbox?: boolean;
  source_provenance?: {
    provider: string;
    method: string;
    metadata?: Record<string, unknown>;
  };
};

export type DocumentIntakeApprovalRequest = {
  invoice_id: string;
  confirmation: 'APPROVE-DOCUMENT-INTAKE';
};
