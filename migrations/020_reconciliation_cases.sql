CREATE TABLE IF NOT EXISTS reconciliation_cases (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('test','production')),
  fingerprint TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','ignored')),
  intake_id TEXT REFERENCES document_intakes(id) ON DELETE SET NULL,
  payment_id TEXT REFERENCES payment_records(id) ON DELETE SET NULL,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  external_reference TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolution_code TEXT,
  resolution_note TEXT,
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, environment, fingerprint)
);

CREATE INDEX IF NOT EXISTS reconciliation_cases_queue_idx
  ON reconciliation_cases(company_id, environment, status, severity, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS reconciliation_cases_intake_idx
  ON reconciliation_cases(intake_id) WHERE intake_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reconciliation_cases_payment_idx
  ON reconciliation_cases(payment_id) WHERE payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS reconciliation_case_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES reconciliation_cases(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reconciliation_case_events_case_idx
  ON reconciliation_case_events(case_id, created_at DESC);
