-- TEMPORARY recovery migration for TaxAgent homologation only.
-- The raw secret is never stored in source control; only its SHA-256 hash is persisted.
-- Remove this migration from the branch after the recovery key is atomically rotated.
INSERT INTO api_keys (
  id,
  company_id,
  name,
  environment,
  key_prefix,
  secret_hash,
  scopes
)
SELECT
  'key_recovery_20260923_giss',
  id,
  'Temporary homologation recovery key',
  'test',
  'ta_test_recovery',
  'ffb367837d34492039dd6dc932d4bd7f12ae588a7c38d9d8be5c36829955bc0c',
  ARRAY['*']::TEXT[]
FROM companies
WHERE id = 'comp_209507b918464717b29a4b2219527883'
ON CONFLICT DO NOTHING;
