CREATE TABLE IF NOT EXISTS fiscal_transmission_permits (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  environment TEXT NOT NULL CHECK (environment IN ('test','production')),
  provider TEXT NOT NULL,
  prepared_dps_id TEXT NOT NULL REFERENCES prepared_dps(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','claimed','consumed','revoked','expired')),
  reason TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_invoice_id TEXT REFERENCES invoices(id) ON DELETE RESTRICT,
  outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  UNIQUE(prepared_dps_id)
);

CREATE INDEX IF NOT EXISTS fiscal_transmission_permits_company_status_idx
  ON fiscal_transmission_permits(company_id, environment, status, created_at DESC);

CREATE INDEX IF NOT EXISTS fiscal_transmission_permits_expiry_idx
  ON fiscal_transmission_permits(status, expires_at)
  WHERE status='active';
