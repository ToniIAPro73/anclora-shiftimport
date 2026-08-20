-- FASE 1.2D: password recovery. Same hashed-at-rest pattern as sessions
-- (only the SHA-256 hash is stored, never the raw token). Single-use:
-- used_at is set on redemption and checked on every lookup. Short TTL.
CREATE TABLE password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id);
