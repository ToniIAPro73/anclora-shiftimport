-- Migration 0032: concrete time delta and application metadata for Approval Lite.

BEGIN;

ALTER TABLE change_requests
  ADD COLUMN IF NOT EXISTS requested_start_time TIME;

ALTER TABLE change_requests
  ADD COLUMN IF NOT EXISTS requested_end_time TIME;

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS resulting_schedule_version_id UUID
  REFERENCES schedule_versions (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS approval_requests_resulting_version_idx
  ON approval_requests (resulting_schedule_version_id);

COMMIT;
