ALTER TABLE document_intake_files
  ADD COLUMN IF NOT EXISTS ocr_provider TEXT,
  ADD COLUMN IF NOT EXISTS ocr_job_id TEXT,
  ADD COLUMN IF NOT EXISTS ocr_operation_url TEXT,
  ADD COLUMN IF NOT EXISTS ocr_metadata JSONB,
  ADD COLUMN IF NOT EXISTS ocr_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ocr_completed_at TIMESTAMPTZ;

ALTER TABLE document_intake_files DROP CONSTRAINT IF EXISTS document_intake_files_status_check;
ALTER TABLE document_intake_files
  ADD CONSTRAINT document_intake_files_status_check
  CHECK (status IN ('stored','extracted','awaiting_ocr','ocr_processing','failed'));

CREATE INDEX IF NOT EXISTS document_intake_files_ocr_processing_idx
  ON document_intake_files(company_id, environment, status, ocr_started_at)
  WHERE status='ocr_processing';
