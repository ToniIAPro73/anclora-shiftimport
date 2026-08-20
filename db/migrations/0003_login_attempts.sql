-- FASE 1.2E: distributed login rate limiting. Replaces the naive
-- per-warm-instance in-memory limiter (reset on every cold start, invisible
-- across concurrent serverless instances) with a Neon-backed one. One row
-- per identity key: 'ip:<addr>' or 'email:<normalized>'.
CREATE TABLE login_attempts (
  id_key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INTEGER NOT NULL DEFAULT 0
);
