-- Migration 0010: Import history — extend the existing `imports` table with
-- the fields needed to list, distinguish and safely delete a single import
-- (individual vs team, global vs area, file totals vs created vs already-
-- existing, and a soft-delete trail). Forward-only, idempotent-safe.
--
-- Deletion policy: an import row is SOFT-deleted (deleted_at/deleted_by_user_id)
-- so the history entry survives as "Eliminada"; the shifts it created are HARD
-- deleted (scoped strictly by import_id — see deleteImport in api/_lib/data.js)
-- so they actually disappear from the calendar. Manual shifts always have
-- import_id IS NULL and are never touched by this flow.

BEGIN;

ALTER TABLE imports ADD COLUMN IF NOT EXISTS import_mode TEXT NOT NULL DEFAULT 'individual'
  CHECK (import_mode IN ('individual', 'team'));

ALTER TABLE imports ADD COLUMN IF NOT EXISTS period_kind TEXT NOT NULL DEFAULT 'single'
  CHECK (period_kind IN ('single', 'multi'));

-- Normalized, human-readable snapshot of the imported period (e.g. "Enero 2026"
-- or "Enero–Septiembre 2026"), rendered client-side at confirm time in the
-- active locale. Historical rows are never retranslated after the fact.
ALTER TABLE imports ADD COLUMN IF NOT EXISTS period_label TEXT NOT NULL DEFAULT '';

ALTER TABLE imports ADD COLUMN IF NOT EXISTS scope_type TEXT NOT NULL DEFAULT 'global'
  CHECK (scope_type IN ('global', 'area'));

-- Name snapshot at import time — kept even if the area is later renamed or
-- deactivated, so the history stays comprehensible.
ALTER TABLE imports ADD COLUMN IF NOT EXISTS area_name_snapshot TEXT;

ALTER TABLE imports ADD COLUMN IF NOT EXISTS employee_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS shift_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS created_shift_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS existing_shift_count INTEGER NOT NULL DEFAULT 0;

-- Optional reuse-detection fingerprint of the source file (structural hash,
-- never the file content itself). Nullable: not every caller computes one.
ALTER TABLE imports ADD COLUMN IF NOT EXISTS file_fingerprint TEXT;

-- Soft delete: the import row is preserved (shown as "Eliminada"); the shifts
-- it created are hard-deleted by import_id. See §5/§14 of the feature spec.
ALTER TABLE imports ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS deleted_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL;

-- Backfill scope_type/area_name_snapshot for pre-existing rows from the
-- already-present area_id (best-effort; area may since have been renamed —
-- this is the closest available snapshot at migration time).
UPDATE imports SET scope_type = 'area' WHERE area_id IS NOT NULL AND scope_type = 'global';
UPDATE imports i SET area_name_snapshot = a.name
  FROM areas a
  WHERE i.area_id = a.id AND i.area_name_snapshot IS NULL;

CREATE INDEX IF NOT EXISTS imports_deleted_at_idx ON imports (deleted_at);
CREATE INDEX IF NOT EXISTS imports_org_created_idx ON imports (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS imports_file_fingerprint_idx ON imports (organization_id, file_fingerprint);

COMMIT;
