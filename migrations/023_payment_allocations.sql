CREATE TABLE IF NOT EXISTS economic_operation_payment_allocations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('test','production')),
  economic_operation_id TEXT NOT NULL REFERENCES economic_operations(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL REFERENCES payment_records(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(economic_operation_id, payment_id)
);

CREATE INDEX IF NOT EXISTS economic_operation_payment_allocations_operation_idx
  ON economic_operation_payment_allocations(company_id, environment, economic_operation_id);
CREATE INDEX IF NOT EXISTS economic_operation_payment_allocations_payment_idx
  ON economic_operation_payment_allocations(company_id, environment, payment_id);
