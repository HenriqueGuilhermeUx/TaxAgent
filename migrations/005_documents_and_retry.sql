ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('queued', 'processing', 'retrying', 'authorized', 'rejected', 'cancelled'));

ALTER TABLE fiscal_documents ADD COLUMN IF NOT EXISTS content BYTEA;
ALTER TABLE fiscal_documents ADD COLUMN IF NOT EXISTS content_type TEXT;
ALTER TABLE fiscal_documents ADD COLUMN IF NOT EXISTS content_encoding TEXT NOT NULL DEFAULT 'identity';
CREATE INDEX IF NOT EXISTS fiscal_documents_invoice_kind_idx ON fiscal_documents(invoice_id, kind, created_at DESC);
