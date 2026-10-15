CREATE TABLE IF NOT EXISTS document_intake_files (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('test','production')),
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  sha256 TEXT NOT NULL,
  encrypted_content JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'stored' CHECK (status IN ('stored','extracted','awaiting_ocr','failed')),
  intake_id TEXT REFERENCES document_intakes(id) ON DELETE SET NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, environment, sha256)
);
CREATE INDEX IF NOT EXISTS document_intake_files_company_created_idx
  ON document_intake_files(company_id, environment, created_at DESC);
CREATE INDEX IF NOT EXISTS document_intake_files_status_idx
  ON document_intake_files(company_id, environment, status, created_at);
