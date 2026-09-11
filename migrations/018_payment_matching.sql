CREATE TABLE IF NOT EXISTS payment_records (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('test','production')),
  external_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  occurred_at TIMESTAMPTZ NOT NULL,
  counterparty_tax_id TEXT,
  counterparty_name TEXT,
  reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, environment, external_id)
);

CREATE INDEX IF NOT EXISTS payment_records_lookup_idx
  ON payment_records(company_id, environment, occurred_at DESC, amount);

CREATE TABLE IF NOT EXISTS document_payment_matches (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('test','production')),
  intake_id TEXT NOT NULL REFERENCES document_intakes(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL REFERENCES payment_records(id) ON DELETE CASCADE,
  score NUMERIC(5,4) NOT NULL CHECK (score >= 0 AND score <= 1),
  status TEXT NOT NULL CHECK (status IN ('suggested','confirmed','rejected')),
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(intake_id, payment_id)
);

CREATE INDEX IF NOT EXISTS document_payment_matches_intake_idx
  ON document_payment_matches(company_id, environment, intake_id, score DESC);

CREATE UNIQUE INDEX IF NOT EXISTS document_payment_matches_one_confirmed_per_intake_idx
  ON document_payment_matches(intake_id)
  WHERE status='confirmed';
