ALTER TABLE commercial_pilot_applications
  ADD COLUMN IF NOT EXISTS company_id text REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS enrollment_id text REFERENCES pilot_enrollments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pilot_environment text CHECK (pilot_environment IN ('test','production')),
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS commercial_pilot_applications_enrollment_unique
  ON commercial_pilot_applications(enrollment_id)
  WHERE enrollment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS commercial_pilot_applications_conversion_idx
  ON commercial_pilot_applications(status, converted_at DESC)
  WHERE converted_at IS NOT NULL;
