-- Migration 0016: minimal append-only organization audit log.

BEGIN;

CREATE TABLE IF NOT EXISTS organization_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'MEMBER_ADDED',
    'MEMBER_REMOVED',
    'MEMBER_ROLE_CHANGED',
    'AREA_CREATED',
    'AREA_UPDATED',
    'AREA_DEACTIVATED',
    'EMPLOYEE_USER_LINKED',
    'EMPLOYEE_USER_UNLINKED',
    'EMPLOYEE_AREA_CHANGED'
  )),
  target_type TEXT NOT NULL,
  target_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organization_audit_events_org_created_idx
  ON organization_audit_events (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS organization_audit_events_type_idx
  ON organization_audit_events (organization_id, event_type, created_at DESC);

COMMIT;
