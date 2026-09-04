-- Migration 0017: future scheduling container.
-- Additive and safe for existing organizations, imports, and shifts. The
-- schedule lifecycle belongs to schedule_versions (R3-M02), not this table.

BEGIN;

CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  area_id UUID REFERENCES areas (id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, area_id, period_start)
);

CREATE INDEX IF NOT EXISTS schedules_organization_idx
  ON schedules (organization_id);

CREATE INDEX IF NOT EXISTS schedules_organization_period_idx
  ON schedules (organization_id, period_start);

-- PostgreSQL treats NULLs as distinct in a regular UNIQUE constraint. This
-- partial index enforces one organization-wide schedule per period as well.
CREATE UNIQUE INDEX IF NOT EXISTS schedules_organization_period_global_idx
  ON schedules (organization_id, period_start)
  WHERE area_id IS NULL;

COMMIT;
