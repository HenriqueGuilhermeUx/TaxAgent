CREATE TABLE IF NOT EXISTS fiscal_intents (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('test','production')),
  idempotency_key TEXT NOT NULL,
  request_sha256 TEXT NOT NULL,
  request JSONB NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('needs_input','prepared','signed','queued','authorized','blocked','failed')),
  service_profile TEXT,
  tax_decision_id TEXT REFERENCES tax_decisions(id) ON DELETE SET NULL,
  prepared_dps_id TEXT REFERENCES prepared_dps(id) ON DELETE SET NULL,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, environment, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_intents_prepared_dps_idx
  ON fiscal_intents(prepared_dps_id)
  WHERE prepared_dps_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_intents_invoice_idx
  ON fiscal_intents(invoice_id)
  WHERE invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS fiscal_intents_company_updated_idx
  ON fiscal_intents(company_id, updated_at DESC);
