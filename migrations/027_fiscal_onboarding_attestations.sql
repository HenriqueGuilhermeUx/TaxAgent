CREATE TABLE IF NOT EXISTS fiscal_onboarding_attestations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('test', 'production')),
  assessment_type TEXT NOT NULL CHECK (assessment_type IN ('onboarding', 'preflight')),
  status TEXT NOT NULL,
  route TEXT,
  provider TEXT,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshot JSONB NOT NULL,
  snapshot_sha256 TEXT NOT NULL CHECK (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fiscal_onboarding_attestations_company_created_idx
  ON fiscal_onboarding_attestations(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fiscal_onboarding_attestations_status_idx
  ON fiscal_onboarding_attestations(status, created_at DESC);
