-- One-time TEST API key recovery for Company comp_209507b918464717b29a4b2219527883.
-- The raw secret is intentionally NOT stored in source control; only its SHA-256 hash is persisted.
-- Remove this migration file after the recovery key has been rotated successfully.

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
  'key_recovery_20260923_02',
  id,
  'One-time TEST recovery 2026-09-23 #2',
  'test',
  'ta_test_JOYNYnl4',
  '971fa8d1313839f7f6763d95cc7d9a2e15cd4b43106acd70f65aff405c2b7302',
  ARRAY['*']::TEXT[]
FROM companies
WHERE id = 'comp_209507b918464717b29a4b2219527883'
ON CONFLICT (id) DO NOTHING;
