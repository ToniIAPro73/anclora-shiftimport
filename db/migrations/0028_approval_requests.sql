-- Migration 0028: route employee change requests through Approval Lite.
-- The request and its approval envelope are created atomically by the
-- change-request write path. Notifications reuse the existing in-app channel.

BEGIN;

CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  change_request_id UUID NOT NULL REFERENCES change_requests (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  policy_snapshot TEXT NOT NULL
    CHECK (policy_snapshot IN ('NO_APPROVAL', 'AREA_RESPONSIBLE', 'ORGANIZATION_ADMIN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT approval_requests_change_request_unique UNIQUE (change_request_id)
);

CREATE INDEX IF NOT EXISTS approval_requests_organization_status_idx
  ON approval_requests (organization_id, status, created_at DESC);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('SHIFT_PUBLISHED', 'CHANGE_REQUEST_RESOLVED', 'APPROVAL_REQUEST_CREATED'));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_resource_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_resource_type_check
    CHECK (resource_type IN ('SHIFT', 'CHANGE_REQUEST', 'APPROVAL_REQUEST'));

COMMIT;
