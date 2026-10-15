CREATE SEQUENCE IF NOT EXISTS external_inbox_nsu_seq START 1;

CREATE TABLE IF NOT EXISTS document_intakes (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('test','production')),
  source_type TEXT NOT NULL CHECK (source_type IN ('xml','text')),
  provider TEXT NOT NULL,
  document_type TEXT NOT NULL,
  authority TEXT NOT NULL CHECK (authority IN ('fiscal_xml','unverified_text')),
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source_sha256 TEXT NOT NULL,
  canonical_document JSONB NOT NULL,
  provider_metadata JSONB,
  status TEXT NOT NULL DEFAULT 'extracted' CHECK (status IN ('extracted','inbox','approved','posted')),
  inbox_document_id TEXT REFERENCES inbox_documents(id),
  linked_invoice_id TEXT REFERENCES invoices(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, environment, source_sha256)
);

CREATE INDEX IF NOT EXISTS document_intakes_company_created_idx
  ON document_intakes(company_id, environment, created_at DESC);
CREATE INDEX IF NOT EXISTS document_intakes_invoice_idx
  ON document_intakes(linked_invoice_id)
  WHERE linked_invoice_id IS NOT NULL;

ALTER TABLE inbox_documents ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'adn';
ALTER TABLE inbox_documents ADD COLUMN IF NOT EXISTS source_reference TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS inbox_documents_external_source_idx
  ON inbox_documents(company_id, environment, source, source_reference)
  WHERE source_reference IS NOT NULL;
