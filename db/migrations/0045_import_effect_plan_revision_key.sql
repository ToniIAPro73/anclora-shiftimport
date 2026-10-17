-- Migration 0045: plan revision effects carry a per-revision key.
--
-- 0044 keyed every revision of a scope with the same resource_key, which would have made any later revision depend on every earlier
-- one. Lineage between revisions is expressed by the (scope, employee, month) PLAN_COVERAGE markers only (a revision depends on an
-- earlier one when they cover the same employee in the same month). Redefines the trigger function; no data change.

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
    -- one key per revision: lineage between revisions is carried ONLY by the (scope, employee, month) coverage markers below
    v_key := 'planrev:' || v_scope || ':' || (v_row ->> 'revision_number');
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

-- Physical-row lookups ("which imports touched this row?") used by the reversion planner and its audit view.
CREATE INDEX IF NOT EXISTS import_effects_resource_idx ON import_effects (resource_type, resource_id);
