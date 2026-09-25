ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_decision_id TEXT REFERENCES tax_decisions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS invoices_tax_decision_idx ON invoices(tax_decision_id) WHERE tax_decision_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tax_ledger_entries (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  tax_decision_id TEXT REFERENCES tax_decisions(id) ON DELETE SET NULL,
  effective_at DATE NOT NULL,
  tax_type TEXT NOT NULL CHECK (tax_type IN ('IBS','CBS')),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('debit','credit','adjustment')),
  base_amount NUMERIC(20,2),
  rate NUMERIC(18,9),
  amount NUMERIC(20,2) NOT NULL,
  reference_only BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS tax_ledger_invoice_tax_unique
  ON tax_ledger_entries(invoice_id, tax_type, entry_type)
  WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tax_ledger_company_period_idx
  ON tax_ledger_entries(company_id, effective_at, tax_type);
