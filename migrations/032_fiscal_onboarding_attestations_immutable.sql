CREATE OR REPLACE FUNCTION taxagent_block_fiscal_onboarding_attestation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'fiscal_onboarding_attestations is append-only; UPDATE/DELETE is forbidden'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS fiscal_onboarding_attestations_immutable_trg ON fiscal_onboarding_attestations;

CREATE TRIGGER fiscal_onboarding_attestations_immutable_trg
BEFORE UPDATE OR DELETE ON fiscal_onboarding_attestations
FOR EACH ROW
EXECUTE FUNCTION taxagent_block_fiscal_onboarding_attestation_mutation();

COMMENT ON TRIGGER fiscal_onboarding_attestations_immutable_trg ON fiscal_onboarding_attestations IS
  'DB-enforced append-only audit evidence. Also intentionally prevents deleting a Company through ON DELETE CASCADE once fiscal onboarding evidence exists.';
