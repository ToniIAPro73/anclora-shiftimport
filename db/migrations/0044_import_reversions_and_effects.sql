-- Migration 0044: Import Reversion Engine.
--
-- An import is no longer "rows with import_id": it can touch the effective calendar, plan revisions, schedule drafts, assignments,
-- annotations and calendar changes. A real rollback therefore needs (a) a ledger of what each import did (BEFORE / AFTER), written by
-- the database in the SAME transaction as the business write, (b) an explicit reversion operation (atomic, ordered by the server,
-- auditable) and (c) a state that distinguishes an active import from a reverted one.
--
-- Design decisions (see docs/product/IMPORT_REVERSION_CONTRACT.md):
--   * import_effects is filled by AFTER ROW TRIGGERS driven by the transaction-local setting `app.import_id`. Business statements are
--     untouched; "write applied + ledger failed" (or the reverse) is impossible because both live in one transaction.
--   * No separate dependency table: dependencies are DERIVED from import_effects (two imports are related when they touched the
--     same resource_key, the later one depends on the earlier).
--   * Reverting never deletes the import (imports.reverted_* are distinct from the legacy deleted_*), never renumbers plan revisions
--     (company_plan_revisions.reverted_at), and never touches employee_source_identifiers.
--   * Idempotency of an import now applies to ACTIVE imports only, so the same file can be imported again after a reversion.
-- Forward-only, additive.


-- ---------------------------------------------------------------------------------------------------------------------------------
-- 1. Reversion operations (one row = one user request, always completed: the operation is atomic, a failure leaves no row)
-- ---------------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_reversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  requested_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 2000),
  requested_import_count INTEGER NOT NULL CHECK (requested_import_count >= 1),
  effective_import_count INTEGER NOT NULL CHECK (effective_import_count >= requested_import_count),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed')),
  plan_hash TEXT NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Double click / retry / network replay of the same confirmed plan resolves to the SAME operation.
CREATE UNIQUE INDEX IF NOT EXISTS import_reversions_plan_hash_idx ON import_reversions (organization_id, plan_hash);

CREATE TABLE IF NOT EXISTS import_reversion_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reversion_id UUID NOT NULL REFERENCES import_reversions (id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  import_id UUID NOT NULL REFERENCES imports (id) ON DELETE CASCADE,
  requested_by_user BOOLEAN NOT NULL,
  auto_included_dependency BOOLEAN NOT NULL,
  execution_order INTEGER NOT NULL CHECK (execution_order >= 1),
  outcome TEXT NOT NULL DEFAULT 'REVERTED' CHECK (outcome IN ('REVERTED')),
  effect_count INTEGER NOT NULL DEFAULT 0,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT import_reversion_items_unique UNIQUE (reversion_id, import_id)
);

CREATE INDEX IF NOT EXISTS import_reversion_items_import_idx ON import_reversion_items (import_id);

-- ---------------------------------------------------------------------------------------------------------------------------------
-- 2. Import state: active vs reverted (legacy deleted_* is a different concept and is never reinterpreted)
-- ---------------------------------------------------------------------------------------------------------------------------------
ALTER TABLE imports ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS reverted_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS reversion_id UUID REFERENCES import_reversions (id) ON DELETE SET NULL;

-- Idempotency applies to ACTIVE imports only. The unique key (organization, employee, file_fingerprint, context_fingerprint) is
-- KEPT as it is (code already deployed relies on its exact ON CONFLICT predicate); a reversion releases the key by moving the
-- original context fingerprint to reverted_context_fingerprint and suffixing the live one, so the same file can be imported again.
ALTER TABLE imports ADD COLUMN IF NOT EXISTS reverted_context_fingerprint TEXT;

CREATE INDEX IF NOT EXISTS imports_reverted_idx ON imports (organization_id, reverted_at) WHERE reverted_at IS NOT NULL;

-- A reverted plan revision stays as audit history but is no longer a baseline; revision numbers are never renumbered.
ALTER TABLE company_plan_revisions ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ;
ALTER TABLE company_plan_revisions ADD COLUMN IF NOT EXISTS reversion_id UUID REFERENCES import_reversions (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- 3. Effect ledger (BEFORE / AFTER of every mutation an import performs), written by triggers
-- ---------------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_effects (
  id BIGSERIAL PRIMARY KEY,                       -- also the strict execution order (effect_order)
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  import_id UUID NOT NULL REFERENCES imports (id) ON DELETE CASCADE,
  effect_kind TEXT NOT NULL CHECK (effect_kind IN (
    'SHIFT_INSERT', 'SHIFT_UPDATE', 'SHIFT_DELETE', 'SHIFT_STATE_TRANSITION',
    'ASSIGNMENT_INSERT', 'ASSIGNMENT_UPDATE', 'ASSIGNMENT_DELETE',
    'SCHEDULE_INSERT', 'SCHEDULE_UPDATE', 'SCHEDULE_VERSION_INSERT', 'SCHEDULE_VERSION_UPDATE',
    'PLAN_REVISION_INSERT', 'PLAN_COVERAGE',
    'ANNOTATION_INSERT', 'ANNOTATION_UPDATE', 'CALENDAR_CHANGE_INSERT'
  )),
  resource_type TEXT NOT NULL,                    -- table the row lives in (reversion whitelist)
  resource_key TEXT NOT NULL,                     -- LOGICAL identity (employee/date, schedule/employee/date, scope/employee/month …)
  resource_id UUID,                               -- physical row id when the effect maps to one row
  before_state JSONB,
  after_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reverted_at TIMESTAMPTZ,
  reversion_id UUID REFERENCES import_reversions (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS import_effects_import_idx ON import_effects (import_id, id);
CREATE INDEX IF NOT EXISTS import_effects_active_key_idx ON import_effects (organization_id, resource_key) WHERE reverted_at IS NULL;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- 4. Trigger: records the effect when the transaction declared `app.import_id`
-- ---------------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_import_effect() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_import_text TEXT := current_setting('app.import_id', true);
  v_import UUID;
  v_old JSONB;
  v_new JSONB;
  v_row JSONB;
  v_org UUID;
  v_kind TEXT;
  v_key TEXT;
  v_schedule UUID;
  v_employee_key TEXT;
  v_month TEXT;
  v_scope TEXT;
BEGIN
  IF v_import_text IS NULL OR v_import_text = '' THEN
    RETURN NULL;
  END IF;
  v_import := v_import_text::UUID;
  v_old := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  v_new := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  v_row := COALESCE(v_new, v_old);
  -- a no-op UPDATE (e.g. the idempotent re-touch of updated_at) is not an effect
  IF TG_OP = 'UPDATE' AND (v_old - 'updated_at') = (v_new - 'updated_at') THEN
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'shifts' THEN
    v_org := (v_row ->> 'organization_id')::UUID;
    v_key := 'day:' || (v_row ->> 'employee_id') || ':' || (v_row ->> 'date');
    v_kind := CASE TG_OP
      WHEN 'INSERT' THEN 'SHIFT_INSERT'
      WHEN 'DELETE' THEN 'SHIFT_DELETE'
      ELSE CASE WHEN (v_old - 'effective_state' - 'change_id' - 'updated_at') = (v_new - 'effective_state' - 'change_id' - 'updated_at')
                THEN 'SHIFT_STATE_TRANSITION' ELSE 'SHIFT_UPDATE' END
    END;
  ELSIF TG_TABLE_NAME = 'calendar_changes' THEN
    v_org := (v_row ->> 'organization_id')::UUID;
    v_key := 'day:' || (v_row ->> 'employee_id') || ':' || (v_row ->> 'date');
    v_kind := 'CALENDAR_CHANGE_INSERT';
    IF TG_OP <> 'INSERT' THEN RETURN NULL; END IF;
  ELSIF TG_TABLE_NAME = 'calendar_annotations' THEN
    v_org := (v_row ->> 'organization_id')::UUID;
    v_key := 'ann:' || (v_row ->> 'employee_id') || ':' || (v_row ->> 'date') || ':' || (v_row ->> 'kind') || ':' || (v_row ->> 'origin');
    IF TG_OP = 'DELETE' THEN RETURN NULL; END IF;
    v_kind := CASE TG_OP WHEN 'INSERT' THEN 'ANNOTATION_INSERT' ELSE 'ANNOTATION_UPDATE' END;
  ELSIF TG_TABLE_NAME = 'shift_assignments' THEN
    SELECT sv.schedule_id, s.organization_id INTO v_schedule, v_org
    FROM schedule_versions sv JOIN schedules s ON s.id = sv.schedule_id
    WHERE sv.id = (v_row ->> 'schedule_version_id')::UUID;
    IF v_org IS NULL THEN RETURN NULL; END IF;
    v_key := 'asg:' || v_schedule || ':' || (v_row ->> 'employee_id') || ':' || (v_row ->> 'date');
    v_kind := CASE TG_OP WHEN 'INSERT' THEN 'ASSIGNMENT_INSERT' WHEN 'DELETE' THEN 'ASSIGNMENT_DELETE' ELSE 'ASSIGNMENT_UPDATE' END;
  ELSIF TG_TABLE_NAME = 'schedules' THEN
    v_org := (v_row ->> 'organization_id')::UUID;
    v_key := 'sch:' || (v_row ->> 'id');
    IF TG_OP = 'DELETE' THEN RETURN NULL; END IF;
    v_kind := CASE TG_OP WHEN 'INSERT' THEN 'SCHEDULE_INSERT' ELSE 'SCHEDULE_UPDATE' END;
  ELSIF TG_TABLE_NAME = 'schedule_versions' THEN
    SELECT s.organization_id INTO v_org FROM schedules s WHERE s.id = (v_row ->> 'schedule_id')::UUID;
    IF v_org IS NULL OR TG_OP = 'DELETE' THEN RETURN NULL; END IF;
    v_key := 'sch:' || (v_row ->> 'schedule_id');
    v_kind := CASE TG_OP WHEN 'INSERT' THEN 'SCHEDULE_VERSION_INSERT' ELSE 'SCHEDULE_VERSION_UPDATE' END;
  ELSIF TG_TABLE_NAME = 'company_plan_revisions' THEN
    IF TG_OP <> 'INSERT' THEN RETURN NULL; END IF;
    v_org := (v_row ->> 'organization_id')::UUID;
    v_scope := v_row ->> 'scope_key';
    v_key := 'planrev:' || v_scope;
    v_kind := 'PLAN_REVISION_INSERT';
    -- Lineage markers: a later revision depends on an earlier one when they cover the same employee in the same month.
    INSERT INTO import_effects (organization_id, import_id, effect_kind, resource_type, resource_key, resource_id, before_state, after_state)
    SELECT v_org, v_import, 'PLAN_COVERAGE', TG_TABLE_NAME,
           'plan:' || v_scope || ':' || cov.k || ':' || cov.m, (v_row ->> 'id')::UUID, NULL, NULL
    FROM (
      SELECT DISTINCT r ->> 'k' AS k, substring(r ->> 'd' FROM 1 FOR 7) AS m
      FROM jsonb_array_elements(COALESCE(v_row -> 'rows', '[]'::jsonb)) r
    ) cov;
  ELSE
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'company_plan_revisions' THEN
    v_new := v_new - 'rows'; -- the plan content lives in the revision itself; the ledger keeps only what is needed to revert it
  END IF;
  INSERT INTO import_effects (organization_id, import_id, effect_kind, resource_type, resource_key, resource_id, before_state, after_state)
  VALUES (v_org, v_import, v_kind, TG_TABLE_NAME, v_key, (v_row ->> 'id')::UUID, v_old, v_new);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_import_effect ON shifts;
CREATE TRIGGER trg_import_effect AFTER INSERT OR UPDATE OR DELETE ON shifts FOR EACH ROW EXECUTE FUNCTION record_import_effect();
DROP TRIGGER IF EXISTS trg_import_effect ON shift_assignments;
CREATE TRIGGER trg_import_effect AFTER INSERT OR UPDATE OR DELETE ON shift_assignments FOR EACH ROW EXECUTE FUNCTION record_import_effect();
DROP TRIGGER IF EXISTS trg_import_effect ON schedules;
CREATE TRIGGER trg_import_effect AFTER INSERT OR UPDATE ON schedules FOR EACH ROW EXECUTE FUNCTION record_import_effect();
DROP TRIGGER IF EXISTS trg_import_effect ON schedule_versions;
CREATE TRIGGER trg_import_effect AFTER INSERT OR UPDATE ON schedule_versions FOR EACH ROW EXECUTE FUNCTION record_import_effect();
DROP TRIGGER IF EXISTS trg_import_effect ON company_plan_revisions;
CREATE TRIGGER trg_import_effect AFTER INSERT ON company_plan_revisions FOR EACH ROW EXECUTE FUNCTION record_import_effect();
DROP TRIGGER IF EXISTS trg_import_effect ON calendar_annotations;
CREATE TRIGGER trg_import_effect AFTER INSERT OR UPDATE ON calendar_annotations FOR EACH ROW EXECUTE FUNCTION record_import_effect();
DROP TRIGGER IF EXISTS trg_import_effect ON calendar_changes;
CREATE TRIGGER trg_import_effect AFTER INSERT ON calendar_changes FOR EACH ROW EXECUTE FUNCTION record_import_effect();

-- ---------------------------------------------------------------------------------------------------------------------------------
-- 5. Guarded inverse operations (executed inside the reversion transaction; any mismatch aborts the WHOLE operation)
-- ---------------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION import_reversion_apply(
  p_op TEXT, p_table TEXT, p_id UUID, p_org UUID, p_expected JSONB, p_payload JSONB
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER;
  v_sets TEXT;
  v_noise TEXT[] := ARRAY['created_at', 'updated_at'];
BEGIN
  IF p_table NOT IN ('shifts', 'shift_assignments', 'schedules', 'schedule_versions', 'company_plan_revisions', 'calendar_annotations', 'calendar_changes') THEN
    RAISE EXCEPTION 'REVERSION_TABLE_NOT_ALLOWED:%', p_table USING ERRCODE = 'P0001';
  END IF;

  IF p_op = 'DELETE' THEN
    EXECUTE format(
      'DELETE FROM %I t WHERE t.id = $1 AND (to_jsonb(t) - $3) = ($2 - $3)', p_table
    ) USING p_id, p_expected, v_noise;
  ELSIF p_op = 'RESTORE' THEN
    SELECT string_agg(format('%I = r.%I', k, k), ', ') INTO v_sets
    FROM jsonb_object_keys(p_payload) k WHERE k NOT IN ('id', 'organization_id', 'created_at');
    EXECUTE format(
      'UPDATE %I t SET %s FROM jsonb_populate_record(NULL::%I, $1) r WHERE t.id = $2 AND (to_jsonb(t) - $4) = ($3 - $4)',
      p_table, v_sets, p_table
    ) USING p_payload, p_id, p_expected, v_noise;
  ELSIF p_op = 'INSERT' THEN
    EXECUTE format('INSERT INTO %I SELECT * FROM jsonb_populate_record(NULL::%I, $1)', p_table, p_table) USING p_payload;
  ELSIF p_op = 'MARK_REVERTED' THEN
    IF p_table <> 'company_plan_revisions' THEN RAISE EXCEPTION 'REVERSION_OP_NOT_ALLOWED' USING ERRCODE = 'P0001'; END IF;
    UPDATE company_plan_revisions SET reverted_at = NOW(), reversion_id = (p_payload ->> 'reversion_id')::UUID
    WHERE id = p_id AND organization_id = p_org AND reverted_at IS NULL;
  ELSIF p_op = 'DETACH_MANUAL' THEN
    IF p_table <> 'calendar_annotations' THEN RAISE EXCEPTION 'REVERSION_OP_NOT_ALLOWED' USING ERRCODE = 'P0001'; END IF;
    -- a human completed this imported annotation: it survives as an independent manual/administrative annotation
    UPDATE calendar_annotations SET origin = 'MANUAL', import_id = NULL, source_kind = NULL, updated_at = NOW()
    WHERE id = p_id AND organization_id = p_org AND origin = 'IMPORT' AND (to_jsonb(calendar_annotations) - v_noise) = (p_expected - v_noise);
  ELSE
    RAISE EXCEPTION 'REVERSION_OP_UNKNOWN:%', p_op USING ERRCODE = 'P0001';
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'REVERSION_PLAN_STALE:%:%:%', p_op, p_table, p_id USING ERRCODE = 'P0001';
  END IF;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION import_reversion_assert(p_ok BOOLEAN, p_what TEXT) RETURNS INTEGER LANGUAGE plpgsql AS $$
BEGIN
  IF NOT p_ok THEN
    RAISE EXCEPTION 'REVERSION_PLAN_STALE:%', p_what USING ERRCODE = 'P0001';
  END IF;
  RETURN 1;
END;
$$;
