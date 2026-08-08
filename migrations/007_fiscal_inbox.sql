CREATE TABLE IF NOT EXISTS inbox_cursors (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('test','production')),
  last_nsu BIGINT NOT NULL DEFAULT 0,
  last_sync_at TIMESTAMPTZ,
  backoff_until TIMESTAMPTZ,
  last_status TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(company_id, environment)
);

CREATE TABLE IF NOT EXISTS inbox_documents (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('test','production')),
  nsu BIGINT NOT NULL,
  access_key TEXT,
  document_type TEXT,
  event_type TEXT,
  generated_at TIMESTAMPTZ,
  sha256 TEXT,
  content BYTEA,
  content_type TEXT,
  metadata JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, environment, nsu)
);
CREATE INDEX IF NOT EXISTS inbox_documents_company_received_idx
  ON inbox_documents(company_id, environment, received_at DESC);
CREATE INDEX IF NOT EXISTS inbox_documents_access_key_idx
  ON inbox_documents(company_id, access_key)
  WHERE access_key IS NOT NULL;
