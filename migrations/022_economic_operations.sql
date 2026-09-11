CREATE TABLE IF NOT EXISTS economic_operations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('test','production')),
  operation_type TEXT NOT NULL CHECK (operation_type IN ('sale','purchase','service_provided','service_received','other')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','partially_settled','settled','divergent','cancelled')),
  counterparty_tax_id TEXT,
  counterparty_name TEXT,
  currency TEXT NOT NULL DEFAULT 'BRL',
  gross_amount NUMERIC(18,2) NOT NULL CHECK (gross_amount >= 0),
  occurred_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE document_intakes ADD COLUMN IF NOT EXISTS economic_operation_id TEXT REFERENCES economic_operations(id) ON DELETE SET NULL;
ALTER TABLE payment_records ADD COLUMN IF NOT EXISTS economic_operation_id TEXT REFERENCES economic_operations(id) ON DELETE SET NULL;
ALTER TABLE tax_position_financial_evidence ADD COLUMN IF NOT EXISTS economic_operation_id TEXT REFERENCES economic_operations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS economic_operations_company_status_idx ON economic_operations(company_id, environment, status, occurred_at DESC);
CREATE INDEX IF NOT EXISTS economic_operations_counterparty_idx ON economic_operations(company_id, environment, counterparty_tax_id) WHERE counterparty_tax_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS document_intakes_economic_operation_idx ON document_intakes(economic_operation_id) WHERE economic_operation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_records_economic_operation_idx ON payment_records(economic_operation_id) WHERE economic_operation_id IS NOT NULL;
