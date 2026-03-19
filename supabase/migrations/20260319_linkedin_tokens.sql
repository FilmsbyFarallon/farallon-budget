CREATE TABLE IF NOT EXISTS linkedin_tokens (
  id text PRIMARY KEY DEFAULT 'default',
  access_token text NOT NULL,
  refresh_token text,
  expires_at bigint,
  pages jsonb,
  updated_at timestamptz DEFAULT now()
);
