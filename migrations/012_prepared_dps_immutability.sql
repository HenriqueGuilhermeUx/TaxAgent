CREATE OR REPLACE FUNCTION taxagent_guard_prepared_dps_immutable()
RETURNS trigger AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.environment IS DISTINCT FROM OLD.environment
    OR NEW.tax_decision_id IS DISTINCT FROM OLD.tax_decision_id
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.request_sha256 IS DISTINCT FROM OLD.request_sha256
    OR NEW.canonical_input_sha256 IS DISTINCT FROM OLD.canonical_input_sha256
    OR NEW.canonical_input IS DISTINCT FROM OLD.canonical_input
    OR NEW.dps_id IS DISTINCT FROM OLD.dps_id
    OR NEW.sequence IS DISTINCT FROM OLD.sequence
    OR NEW.series IS DISTINCT FROM OLD.series
    OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
    OR NEW.competence IS DISTINCT FROM OLD.competence
    OR NEW.schema_id IS DISTINCT FROM OLD.schema_id
    OR NEW.builder_mode IS DISTINCT FROM OLD.builder_mode
    OR NEW.unsigned_xml IS DISTINCT FROM OLD.unsigned_xml
    OR NEW.unsigned_xml_sha256 IS DISTINCT FROM OLD.unsigned_xml_sha256
  THEN
    RAISE EXCEPTION 'Prepared DPS frozen fields are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prepared_dps_immutable_guard ON prepared_dps;
CREATE TRIGGER prepared_dps_immutable_guard
BEFORE UPDATE ON prepared_dps
FOR EACH ROW EXECUTE FUNCTION taxagent_guard_prepared_dps_immutable();
