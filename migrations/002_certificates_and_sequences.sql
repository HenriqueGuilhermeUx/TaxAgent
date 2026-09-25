CREATE TABLE IF NOT EXISTS certificates (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  encrypted_pfx JSONB NOT NULL,
  encrypted_password JSONB NOT NULL,
  certificate_fingerprint TEXT NOT NULL,
  serial_number TEXT,
  subject TEXT,
  issuer TEXT,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS certificates_company_active_idx
  ON certificates(company_id)
  WHERE status='active';

CREATE TABLE IF NOT EXISTS dps_sequences (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('test', 'production')),
  next_number BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY(company_id, environment)
);
