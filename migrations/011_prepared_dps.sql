CREATE TABLE IF NOT EXISTS prepared_dps (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  environment TEXT NOT NULL CHECK (environment IN ('test','production')),
  tax_decision_id TEXT NOT NULL REFERENCES tax_decisions(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  request_sha256 TEXT NOT NULL,
  canonical_input_sha256 TEXT NOT NULL,
  canonical_input JSONB NOT NULL,
  dps_id TEXT NOT NULL,
  sequence BIGINT NOT NULL,
  series TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  competence DATE NOT NULL,
  schema_id TEXT NOT NULL,
  builder_mode TEXT NOT NULL,
  unsigned_xml BYTEA NOT NULL,
  unsigned_xml_sha256 TEXT NOT NULL,
  signed_xml BYTEA,
  signed_xml_sha256 TEXT,
  certificate_fingerprint TEXT,
  status TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','signed','consumed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signed_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  UNIQUE(company_id, environment, idempotency_key),
  UNIQUE(dps_id)
);
CREATE INDEX IF NOT EXISTS prepared_dps_company_created_idx ON prepared_dps(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS prepared_dps_tax_decision_idx ON prepared_dps(tax_decision_id);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS prepared_dps_id TEXT REFERENCES prepared_dps(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_prepared_dps_unique_idx ON invoices(prepared_dps_id) WHERE prepared_dps_id IS NOT NULL;
