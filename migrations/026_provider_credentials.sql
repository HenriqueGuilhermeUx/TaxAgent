CREATE TABLE IF NOT EXISTS fiscal_provider_credentials (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('test', 'production')),
  encrypted_credentials JSONB NOT NULL,
  credential_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'disabled')),
  verification_metadata JSONB,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, provider, environment)
);
CREATE INDEX IF NOT EXISTS fiscal_provider_credentials_company_idx
  ON fiscal_provider_credentials(company_id, environment, provider);
