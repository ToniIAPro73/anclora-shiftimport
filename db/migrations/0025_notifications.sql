-- Migration 0025: minimal in-app notifications for authenticated recipients.
-- Delivery outside the app (push, email, SMS) is deliberately out of scope.

BEGIN;

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('SHIFT_PUBLISHED', 'CHANGE_REQUEST_RESOLVED')),
  resource_type TEXT NOT NULL CHECK (resource_type IN ('SHIFT', 'CHANGE_REQUEST')),
  resource_id UUID NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notifications_user_type_resource_unique UNIQUE (user_id, type, resource_id)
);

CREATE INDEX IF NOT EXISTS notifications_user_read_created_idx
  ON notifications (user_id, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_organization_created_idx
  ON notifications (organization_id, created_at DESC);

COMMIT;
