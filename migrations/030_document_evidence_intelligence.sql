CREATE TABLE IF NOT EXISTS document_evidence_refs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('test','production')),
  docwallet_document_id TEXT NOT NULL,
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('customer_document','fiscal_document','regulatory_source','operation_dossier')),
  title TEXT NOT NULL,
  document_type TEXT,
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  intelligence_status TEXT,
  source_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, environment, docwallet_document_id)
);

CREATE INDEX IF NOT EXISTS idx_document_evidence_refs_company_created
  ON document_evidence_refs(company_id, environment, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_evidence_refs_sha256
  ON document_evidence_refs(company_id, sha256);

CREATE TABLE IF NOT EXISTS fiscal_regulatory_changes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_url TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  effective_at DATE,
  source_sha256 TEXT CHECK (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$'),
  docwallet_document_id TEXT,
  affected_city_codes TEXT[] NOT NULL DEFAULT '{}',
  affected_tax_regimes TEXT[] NOT NULL DEFAULT '{}',
  affected_routes TEXT[] NOT NULL DEFAULT '{}',
  requires_action BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','withdrawn')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_regulatory_changes_effective
  ON fiscal_regulatory_changes(status, effective_at DESC, published_at DESC);
