-- Versioned worktime targets. The legacy annual table remains as a read-only
-- historical compatibility source during rollout; all active runtime access
-- moves to this additive authority.
CREATE TABLE IF NOT EXISTS employee_worktime_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('CONTRACTUAL', 'OPERATIONAL')),
  period_type TEXT NOT NULL CHECK (period_type IN ('ANNUAL', 'WEEKLY', 'MONTHLY', 'CUSTOM')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  minimum_minutes INTEGER NOT NULL CHECK (minimum_minutes >= 0),
  target_minutes INTEGER,
  maximum_minutes INTEGER NOT NULL CHECK (maximum_minutes >= minimum_minutes AND maximum_minutes <= 527040),
  effective_from DATE NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  source TEXT NOT NULL DEFAULT 'ADMIN_UI',
  notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  included_work_buckets TEXT[] NOT NULL DEFAULT ARRAY['Regular']::TEXT[],
  legacy_annual_target_id UUID UNIQUE,
  created_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_worktime_targets_range_check
    CHECK (
      period_end >= period_start
      AND (target_minutes IS NULL OR target_minutes BETWEEN minimum_minutes AND maximum_minutes)
      AND (period_type <> 'ANNUAL' OR (period_start = make_date(EXTRACT(YEAR FROM period_start)::INTEGER, 1, 1)
        AND period_end = make_date(EXTRACT(YEAR FROM period_start)::INTEGER, 12, 31)))
      AND (period_type <> 'MONTHLY' OR (date_trunc('month', period_start)::date = period_start
        AND period_end = (date_trunc('month', period_start) + INTERVAL '1 month - 1 day')::date))
      AND (period_type <> 'WEEKLY' OR period_end = period_start + 6)
    ),
  CONSTRAINT employee_worktime_targets_buckets_check
    CHECK (cardinality(included_work_buckets) > 0 AND array_position(included_work_buckets, NULL::TEXT) IS NULL),
  CONSTRAINT employee_worktime_targets_employee_org_fk
    FOREIGN KEY (employee_id, organization_id)
    REFERENCES employees (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT employee_worktime_targets_series_revision_unique
    UNIQUE (organization_id, employee_id, target_kind, period_start, period_end, revision)
);

CREATE INDEX IF NOT EXISTS employee_worktime_targets_active_idx
  ON employee_worktime_targets (organization_id, employee_id, target_kind, period_start, period_end, effective_from DESC, revision DESC);
CREATE INDEX IF NOT EXISTS employee_worktime_targets_history_idx
  ON employee_worktime_targets (organization_id, employee_id, period_start, period_end, revision DESC);

-- Deliberately no production-row backfill here. ShiftImport and its QA mirror
-- share this schema. The mirror refresh maps legacy annual targets into the
-- versioned authority; production policy backfill is an explicit post-review
-- operation and must not mutate the real tenant in this mission.

ALTER TABLE organization_audit_events
  DROP CONSTRAINT IF EXISTS organization_audit_events_event_type_check;
ALTER TABLE organization_audit_events
  ADD CONSTRAINT organization_audit_events_event_type_check CHECK (event_type IN (
    'MEMBER_ADDED', 'MEMBER_REMOVED', 'MEMBER_ROLE_CHANGED', 'AREA_CREATED', 'AREA_UPDATED',
    'AREA_DEACTIVATED', 'AREA_REACTIVATED', 'EMPLOYEE_USER_LINKED', 'EMPLOYEE_USER_UNLINKED', 'EMPLOYEE_AREA_CHANGED',
    'IMPORT_BLOCKED', 'IMPORT_FAILED', 'PLAN_LIMIT_REJECTED', 'approval_request.created',
    'approval_request.approved', 'approval_request.rejected', 'OWNERSHIP_TRANSFERRED',
    'PLANNER_SCOPE_CHANGED', 'ASSIGNMENT_CREATED', 'ASSIGNMENT_UPDATED', 'ASSIGNMENT_REMOVED',
    'EMPLOYEE_ANNUAL_TARGET_SET', 'EMPLOYEE_ANNUAL_TARGET_UPDATED',
    'EMPLOYEE_WORKTIME_TARGET_VERSION_CREATED', 'CALENDAR_CHANGE_APPLIED', 'CALENDAR_DAY_RECONCILED'
  ));
