CREATE OR REPLACE FUNCTION taxagent_guard_fiscal_intent_immutable()
RETURNS trigger AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.environment IS DISTINCT FROM OLD.environment
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.request_sha256 IS DISTINCT FROM OLD.request_sha256
    OR NEW.request IS DISTINCT FROM OLD.request
  THEN
    RAISE EXCEPTION 'Fiscal Intent original request is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fiscal_intent_immutable_guard ON fiscal_intents;
CREATE TRIGGER fiscal_intent_immutable_guard
BEFORE UPDATE ON fiscal_intents
FOR EACH ROW EXECUTE FUNCTION taxagent_guard_fiscal_intent_immutable();
