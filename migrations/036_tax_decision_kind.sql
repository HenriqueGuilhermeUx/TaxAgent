ALTER TABLE tax_decisions
  ADD COLUMN IF NOT EXISTS decision_kind TEXT NOT NULL DEFAULT 'issuance';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tax_decisions_decision_kind_check'
  ) THEN
    ALTER TABLE tax_decisions
      ADD CONSTRAINT tax_decisions_decision_kind_check
      CHECK (decision_kind IN ('issuance', 'rtc_calculation'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tax_decisions_company_kind_created_idx
  ON tax_decisions(company_id, decision_kind, created_at DESC);
