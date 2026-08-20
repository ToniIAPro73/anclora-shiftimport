-- FASE 1: multi-tenant smart import foundation.
-- Tenancy rule: every business row carries organization_id. Shifts always
-- carry employee_id too. No UNIQUE on date: multiple legitimate shifts per
-- (organization, employee, date) are allowed (split shifts, corrections).

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('personal', 'company')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

CREATE TABLE memberships (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'EMPLOYEE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, organization_id)
);

CREATE INDEX memberships_organization_idx ON memberships (organization_id);

-- Employee = person appearing on a rota. user_id optional: an Employee does
-- NOT require a login account. external_employee_id = payroll number from PDFs.
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  external_employee_id TEXT,
  name TEXT NOT NULL,
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX employees_organization_idx ON employees (organization_id);

-- External id unique per organization when present (matching anchor).
CREATE UNIQUE INDEX employees_org_external_idx
  ON employees (organization_id, external_employee_id)
  WHERE external_employee_id IS NOT NULL;

-- Import = source document/process, not global calendar state.
CREATE TABLE imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  imported_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  file_name TEXT NOT NULL DEFAULT '',
  source_format TEXT NOT NULL DEFAULT '',
  period_year INTEGER,
  period_month INTEGER,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX imports_organization_idx ON imports (organization_id);

CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  import_id UUID REFERENCES imports (id) ON DELETE SET NULL,
  date DATE NOT NULL,
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL DEFAULT 'MAN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX shifts_org_employee_date_idx ON shifts (organization_id, employee_id, date);
CREATE INDEX shifts_import_idx ON shifts (import_id);

-- Session tokens for cookie auth. Only the SHA-256 hash is stored.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX sessions_user_idx ON sessions (user_id);
