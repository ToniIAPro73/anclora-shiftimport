-- Day annotations imported with a calendar (DCF incidences, observations) + explicit source-identifier
-- mappings (the same person is known by different payroll numbers in different source systems).
-- Additive: no existing column or row changes.

CREATE TABLE IF NOT EXISTS calendar_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  date DATE NOT NULL,
  -- DCF = "Descanso Compensación Formación": informational; it never alters effective hours.
  -- COMMENT = observation text from the source (never a shift type).
  kind TEXT NOT NULL CHECK (kind IN ('DCF', 'COMMENT')),
  body TEXT,
  start_time TEXT,
  end_time TEXT,
  -- DCF only: the source says it exists but does not say when. Never invented.
  completeness TEXT CHECK (completeness IS NULL OR completeness IN ('HOURS_UNKNOWN', 'HOURS_KNOWN')),
  origin TEXT NOT NULL CHECK (origin IN ('IMPORT', 'MANUAL')),
  source_kind TEXT,
  import_id UUID REFERENCES imports (id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calendar_annotations_employee_org_fk
    FOREIGN KEY (employee_id, organization_id)
    REFERENCES employees (id, organization_id) ON DELETE CASCADE,
  CONSTRAINT calendar_annotations_comment_body_check CHECK (kind <> 'COMMENT' OR char_length(btrim(COALESCE(body, ''))) BETWEEN 1 AND 2000),
  CONSTRAINT calendar_annotations_times_check CHECK (
    (start_time IS NULL AND end_time IS NULL) OR (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
  ),
  CONSTRAINT calendar_annotations_unique UNIQUE (organization_id, employee_id, date, kind, origin)
);

CREATE INDEX IF NOT EXISTS calendar_annotations_employee_date_idx
  ON calendar_annotations (organization_id, employee_id, date);

CREATE TABLE IF NOT EXISTS employee_source_identifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  -- e.g. TRYP_EMPLOYEE_CALENDAR, TRYP_TEAM_SCHEDULE
  source_system TEXT NOT NULL CHECK (char_length(btrim(source_system)) BETWEEN 1 AND 80),
  external_identifier TEXT NOT NULL CHECK (char_length(btrim(external_identifier)) BETWEEN 1 AND 80),
  created_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_source_identifiers_employee_org_fk
    FOREIGN KEY (employee_id, organization_id)
    REFERENCES employees (id, organization_id) ON DELETE CASCADE,
  -- One source identifier resolves to exactly one employee.
  CONSTRAINT employee_source_identifiers_unique UNIQUE (organization_id, source_system, external_identifier)
);

CREATE INDEX IF NOT EXISTS employee_source_identifiers_employee_idx
  ON employee_source_identifiers (organization_id, employee_id);
