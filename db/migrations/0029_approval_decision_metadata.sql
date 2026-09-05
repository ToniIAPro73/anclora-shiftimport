-- Migration 0029: decision metadata for Approval Lite.

BEGIN;

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

COMMIT;
