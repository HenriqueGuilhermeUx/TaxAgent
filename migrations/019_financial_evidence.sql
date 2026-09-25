CREATE TABLE IF NOT EXISTS tax_position_financial_evidence (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('test','production')),
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('payment_confirmation')),
  intake_id TEXT NOT NULL REFERENCES document_intakes(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL REFERENCES payment_records(id) ON DELETE CASCADE,
  match_id TEXT NOT NULL REFERENCES document_payment_matches(id) ON DELETE CASCADE,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(match_id)
);

CREATE INDEX IF NOT EXISTS tax_position_financial_evidence_company_period_idx
  ON tax_position_financial_evidence(company_id, environment, effective_at DESC);
CREATE INDEX IF NOT EXISTS tax_position_financial_evidence_invoice_idx
  ON tax_position_financial_evidence(invoice_id)
  WHERE invoice_id IS NOT NULL;
