ALTER TABLE fiscal_onboarding_attestations
  ADD COLUMN IF NOT EXISTS readiness_fingerprint_sha256 TEXT
  CHECK (readiness_fingerprint_sha256 IS NULL OR readiness_fingerprint_sha256 ~ '^[a-f0-9]{64}$');

CREATE INDEX IF NOT EXISTS fiscal_onboarding_attestations_readiness_fingerprint_idx
  ON fiscal_onboarding_attestations(company_id, environment, readiness_fingerprint_sha256, created_at DESC);

COMMENT ON COLUMN fiscal_onboarding_attestations.readiness_fingerprint_sha256 IS
  'SHA-256 of non-secret local fiscal readiness metadata (company profile, active A1 metadata, route/provider and provider-credential metadata). NULL marks legacy evidence that must be reassessed.';

CREATE OR REPLACE FUNCTION taxagent_touch_company_fiscal_configuration()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_company_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_company_id := OLD.company_id;
  ELSE
    target_company_id := NEW.company_id;
  END IF;
  UPDATE companies SET updated_at=NOW() WHERE id=target_company_id;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS certificates_touch_company_fiscal_configuration_trg ON certificates;
CREATE TRIGGER certificates_touch_company_fiscal_configuration_trg
AFTER INSERT OR UPDATE OR DELETE ON certificates
FOR EACH ROW EXECUTE FUNCTION taxagent_touch_company_fiscal_configuration();

DROP TRIGGER IF EXISTS provider_credentials_touch_company_fiscal_configuration_trg ON fiscal_provider_credentials;
CREATE TRIGGER provider_credentials_touch_company_fiscal_configuration_trg
AFTER INSERT OR UPDATE OR DELETE ON fiscal_provider_credentials
FOR EACH ROW EXECUTE FUNCTION taxagent_touch_company_fiscal_configuration();

COMMENT ON FUNCTION taxagent_touch_company_fiscal_configuration() IS
  'Invalidates persisted onboarding freshness whenever certificate or provider-credential metadata changes.';
