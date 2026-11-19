CREATE TABLE IF NOT EXISTS danfse_visual_conformance_attestations (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  document_id TEXT NOT NULL REFERENCES fiscal_documents(id) ON DELETE RESTRICT,
  reviewer_key_id TEXT NOT NULL,
  assessment TEXT NOT NULL CHECK (assessment IN ('matched','different','inconclusive')),
  local_pdf_sha256 TEXT NOT NULL,
  official_pdf_sha256 TEXT NOT NULL,
  semantic_assessment TEXT NOT NULL,
  checklist JSONB NOT NULL,
  note_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS danfse_visual_attestations_invoice_created_idx
  ON danfse_visual_conformance_attestations(invoice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS danfse_visual_attestations_document_created_idx
  ON danfse_visual_conformance_attestations(document_id, created_at DESC);

CREATE OR REPLACE FUNCTION taxagent_block_danfse_visual_attestation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'danfse_visual_conformance_attestations is append-only; UPDATE/DELETE is forbidden'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS danfse_visual_attestations_immutable_trg ON danfse_visual_conformance_attestations;

CREATE TRIGGER danfse_visual_attestations_immutable_trg
BEFORE UPDATE OR DELETE ON danfse_visual_conformance_attestations
FOR EACH ROW
EXECUTE FUNCTION taxagent_block_danfse_visual_attestation_mutation();
