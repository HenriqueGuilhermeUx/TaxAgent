CREATE TABLE IF NOT EXISTS pilot_enrollments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('test','production')),
  label TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, environment)
);

CREATE INDEX IF NOT EXISTS idx_pilot_enrollments_environment_status
  ON pilot_enrollments(environment, status, updated_at DESC);
