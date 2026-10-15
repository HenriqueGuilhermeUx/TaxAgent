ALTER TABLE certificates
  ADD COLUMN IF NOT EXISTS subject_tax_id TEXT;

CREATE INDEX IF NOT EXISTS certificates_subject_tax_id_idx
  ON certificates(subject_tax_id)
  WHERE subject_tax_id IS NOT NULL;
