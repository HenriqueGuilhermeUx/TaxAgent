CREATE TABLE IF NOT EXISTS commercial_pilot_applications (
  id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','accepted','rejected')),
  contact_name text NOT NULL,
  email text NOT NULL,
  phone text,
  company_name text NOT NULL,
  tax_id text,
  profile text NOT NULL CHECK (profile IN ('company','accounting_office','software')),
  message text,
  consent boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'taxagent-site',
  internal_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commercial_pilot_applications_status_created_idx
  ON commercial_pilot_applications(status, created_at DESC);
CREATE INDEX IF NOT EXISTS commercial_pilot_applications_email_created_idx
  ON commercial_pilot_applications(lower(email), created_at DESC);