-- Migration 0026: social login (Google/GitHub) via linked external identities.
-- password_hash becomes nullable: an OAuth-only account never gets one.

BEGIN;

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

CREATE TABLE IF NOT EXISTS oauth_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'github')),
  provider_account_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX oauth_identities_provider_account_idx
  ON oauth_identities (provider, provider_account_id);

CREATE INDEX oauth_identities_user_idx ON oauth_identities (user_id);

COMMIT;
