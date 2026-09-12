ALTER TABLE tax_ledger_entries
  ADD COLUMN IF NOT EXISTS environment TEXT;

UPDATE tax_ledger_entries tle
SET environment = i.environment
FROM invoices i
WHERE tle.invoice_id = i.id
  AND tle.environment IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tax_ledger_entries_environment_check'
  ) THEN
    ALTER TABLE tax_ledger_entries
      ADD CONSTRAINT tax_ledger_entries_environment_check
      CHECK (environment IS NULL OR environment IN ('test', 'production'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tax_ledger_company_environment_period_idx
  ON tax_ledger_entries(company_id, environment, effective_at, tax_type);

CREATE INDEX IF NOT EXISTS financial_evidence_company_environment_period_idx
  ON tax_position_financial_evidence(company_id, environment, effective_at);
