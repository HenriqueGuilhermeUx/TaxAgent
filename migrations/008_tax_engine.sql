CREATE TABLE IF NOT EXISTS tax_dataset_versions (
  id TEXT PRIMARY KEY,
  dataset TEXT NOT NULL,
  version TEXT NOT NULL,
  source_url TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  authority TEXT NOT NULL,
  payload JSONB,
  effective_from DATE,
  effective_to DATE,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(dataset, version, sha256)
);
CREATE INDEX IF NOT EXISTS tax_dataset_versions_dataset_idx
  ON tax_dataset_versions(dataset, downloaded_at DESC);

CREATE TABLE IF NOT EXISTS tax_domain_records (
  id BIGSERIAL PRIMARY KEY,
  dataset TEXT NOT NULL,
  record_key TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_version TEXT,
  sha256 TEXT NOT NULL,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(dataset, record_key)
);
CREATE INDEX IF NOT EXISTS tax_domain_records_expiry_idx
  ON tax_domain_records(dataset, expires_at);

CREATE TABLE IF NOT EXISTS tax_decisions (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  effective_at DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('resolved','requires_input','unsupported')),
  input JSONB NOT NULL,
  output JSONB NOT NULL,
  sources JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tax_decisions_company_created_idx
  ON tax_decisions(company_id, created_at DESC);
