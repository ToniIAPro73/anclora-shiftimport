-- Migration 0030: auditable rejection decisions for Approval Lite.

BEGIN;

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS rejected_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE approval_requests
  ADD CONSTRAINT approval_requests_rejected_reason_check
  CHECK (status <> 'REJECTED' OR (rejection_reason IS NOT NULL AND length(trim(rejection_reason)) > 0));

COMMIT;
