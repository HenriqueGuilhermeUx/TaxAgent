CREATE INDEX IF NOT EXISTS fiscal_onboarding_attestations_ops_latest_idx
  ON fiscal_onboarding_attestations(environment, assessment_type, company_id, created_at DESC);
