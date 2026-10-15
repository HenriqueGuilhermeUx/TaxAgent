ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('queued', 'processing', 'retrying', 'authorized', 'cancelling', 'rejected', 'cancelled'));

CREATE TABLE IF NOT EXISTS municipality_capabilities (
  city_code TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('test','production')),
  provider TEXT NOT NULL,
  supported BOOLEAN NOT NULL,
  payload JSONB,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(city_code, environment, provider)
);
CREATE INDEX IF NOT EXISTS municipality_capabilities_expiry_idx ON municipality_capabilities(expires_at);
