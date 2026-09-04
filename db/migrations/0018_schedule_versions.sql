-- Migration 0018: versioned future scheduling state.
-- Additive and safe for existing organizations and schedules. Assignment rows
-- are introduced separately in R3-M03.

BEGIN;

CREATE TABLE IF NOT EXISTS schedule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES schedules (id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'LOCKED', 'COMPLETED')),
  created_by_user_id UUID NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  published_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  UNIQUE (schedule_id, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS schedule_versions_one_draft_idx
  ON schedule_versions (schedule_id)
  WHERE status = 'DRAFT';

CREATE INDEX IF NOT EXISTS schedule_versions_schedule_idx
  ON schedule_versions (schedule_id, version_number DESC);

COMMIT;
