-- Migration 0027: Approval Lite policy and area responsible mapping.
-- The policy is organization-wide in the MVP; area responsibility is an
-- optional N:N mapping used only when AREA_RESPONSIBLE is selected.

BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS approval_policy TEXT NOT NULL DEFAULT 'NO_APPROVAL';

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_approval_policy_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_approval_policy_check
    CHECK (approval_policy IN ('NO_APPROVAL', 'AREA_RESPONSIBLE', 'ORGANIZATION_ADMIN'));

CREATE TABLE IF NOT EXISTS area_responsibles (
  area_id UUID NOT NULL REFERENCES areas (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (area_id, user_id)
);

CREATE INDEX IF NOT EXISTS area_responsibles_organization_idx
  ON area_responsibles (organization_id);

CREATE INDEX IF NOT EXISTS area_responsibles_user_idx
  ON area_responsibles (organization_id, user_id);

COMMIT;
