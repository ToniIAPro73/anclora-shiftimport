-- Migration 0008: optional Areas model (0..N per Organization).
-- Forward-only. Idempotent-safe for repeated runs on fresh DBs or rollback.

BEGIN;

-- Step 1: Create areas table
CREATE TABLE IF NOT EXISTS areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraints: name and code normalized within an org
CREATE UNIQUE INDEX IF NOT EXISTS areas_org_name_idx
  ON areas (organization_id, lower(trim(name)))
  WHERE active = true;

CREATE UNIQUE INDEX IF NOT EXISTS areas_org_code_idx
  ON areas (organization_id, lower(trim(code)))
  WHERE code IS NOT NULL AND active = true;

-- Indexes for lookups
CREATE INDEX IF NOT EXISTS areas_organization_idx ON areas (organization_id);
CREATE INDEX IF NOT EXISTS areas_active_idx ON areas (active);

-- Step 2: Add area_id to employees (nullable — employee belongs directly to Org when null)
-- NOTE: no DO $$ blocks here — db/migrate.mjs splits statements on ";" at
-- end-of-line, which shatters PL/pgSQL bodies. ADD COLUMN IF NOT EXISTS is
-- the idempotent, splitter-safe equivalent.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES areas (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS employees_area_idx ON employees (area_id);

-- Step 3: Add area_id to imports (nullable — org-scoped import when null)
ALTER TABLE imports ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES areas (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS imports_area_idx ON imports (area_id);

-- Step 4: Add area_id to shifts (nullable — snapshot of area at time of shift/import)
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES areas (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS shifts_area_idx ON shifts (area_id);

COMMIT;
