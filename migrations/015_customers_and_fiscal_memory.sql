CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tax_id TEXT NOT NULL,
  normalized_tax_id TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  city_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, normalized_tax_id)
);

CREATE INDEX IF NOT EXISTS idx_customers_company_name ON customers(company_id, normalized_name);

CREATE TABLE IF NOT EXISTS customer_fiscal_memory (
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_profile TEXT NOT NULL,
  iss_withholding_default TEXT NOT NULL CHECK (iss_withholding_default IN ('not_withheld','customer','intermediary')),
  source TEXT NOT NULL DEFAULT 'user_confirmed_default',
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(customer_id, service_profile)
);

-- Existing Autopilot intents already contain customer snapshots. Backfill the customer
-- registry so the first deployed version can reuse customers without asking the user
-- to type them again. No fiscal retention default is inferred from history.
INSERT INTO customers(id, company_id, tax_id, normalized_tax_id, name, normalized_name, city_code)
SELECT
  'cust_' || substr(md5(fi.company_id || ':' || regexp_replace(upper(fi.request->'customer'->>'tax_id'), '[^A-Z0-9]', '', 'g')), 1, 32),
  fi.company_id,
  fi.request->'customer'->>'tax_id',
  regexp_replace(upper(fi.request->'customer'->>'tax_id'), '[^A-Z0-9]', '', 'g'),
  fi.request->'customer'->>'name',
  lower(trim(fi.request->'customer'->>'name')),
  fi.request->'customer'->>'city_code'
FROM fiscal_intents fi
WHERE COALESCE(fi.request->'customer'->>'tax_id','') <> ''
  AND COALESCE(fi.request->'customer'->>'name','') <> ''
  AND COALESCE(fi.request->'customer'->>'city_code','') ~ '^\d{7}$'
ON CONFLICT(company_id, normalized_tax_id) DO NOTHING;
