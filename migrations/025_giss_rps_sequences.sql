CREATE TABLE IF NOT EXISTS giss_rps_counters (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('test', 'production')),
  series TEXT NOT NULL,
  next_number BIGINT NOT NULL DEFAULT 1 CHECK (next_number > 0),
  PRIMARY KEY(company_id, environment, series)
);

CREATE TABLE IF NOT EXISTS giss_rps_assignments (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('test', 'production')),
  series TEXT NOT NULL,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  number BIGINT NOT NULL CHECK (number > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(company_id, environment, series, invoice_id),
  UNIQUE(company_id, environment, series, number)
);
