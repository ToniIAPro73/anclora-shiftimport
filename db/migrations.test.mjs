import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0013_membership_roles_owner.sql');
const ownerInvariantMigrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0014_single_owner_per_organization.sql');
const scopedAreaMigrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0015_membership_scoped_area.sql');
const auditEventsMigrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0016_organization_audit_events.sql');
const schedulesMigrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0017_schedules.sql');
const scheduleVersionsMigrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0018_schedule_versions.sql');
const shiftAssignmentsMigrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0019_shift_assignments.sql');
const shiftScheduleVersionMigrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0020_shifts_schedule_version.sql');

describe('0013 membership roles migration contract', () => {
  it('keeps a CHECK constraint for exactly the four MVP roles', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS memberships_role_check');
    expect(sql).toContain("CHECK (role IN ('OWNER', 'ADMIN', 'PLANNER', 'EMPLOYEE'))");
  });

  it('backfills only the oldest ADMIN when the organization has no OWNER', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toContain("candidate.role = 'ADMIN'");
    expect(sql).toContain("existing_owner.role = 'OWNER'");
    expect(sql).toContain("earlier_admin.role = 'ADMIN'");
    expect(sql).toContain('(earlier_admin.created_at, earlier_admin.user_id)');
  });

  it('adds database defense in depth against a second OWNER', async () => {
    const sql = await readFile(ownerInvariantMigrationPath, 'utf8');
    expect(sql).toContain('memberships_one_owner_per_org_idx');
    expect(sql).toContain("WHERE role = 'OWNER'");
  });
});

describe('0015 membership area scope migration contract', () => {
  it('adds a nullable area foreign key and an index', async () => {
    const sql = await readFile(scopedAreaMigrationPath, 'utf8');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS scoped_area_id UUID REFERENCES areas (id) ON DELETE SET NULL');
    expect(sql).toContain('memberships_scoped_area_idx');
  });

  it('allows area scope only for PLANNER memberships', async () => {
    const sql = await readFile(scopedAreaMigrationPath, 'utf8');
    expect(sql).toContain('memberships_scoped_area_role_check');
    expect(sql).toContain("CHECK (scoped_area_id IS NULL OR role = 'PLANNER')");
  });
});

describe('0016 organization audit events migration contract', () => {
  it('creates an append-only organization-scoped event table and indexes', async () => {
    const sql = await readFile(auditEventsMigrationPath, 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS organization_audit_events');
    expect(sql).toContain('organization_id UUID NOT NULL REFERENCES organizations');
    expect(sql).toContain('metadata JSONB NOT NULL DEFAULT');
    expect(sql).toContain('organization_audit_events_org_created_idx');
  });

  it('keeps the MVP event vocabulary explicit', async () => {
    const sql = await readFile(auditEventsMigrationPath, 'utf8');
    expect(sql).toContain("'MEMBER_ROLE_CHANGED'");
    expect(sql).toContain("'AREA_DEACTIVATED'");
    expect(sql).toContain("'EMPLOYEE_USER_LINKED'");
  });
});

describe('0017 schedules migration contract', () => {
  it('creates an organization-scoped scheduling container with optional area', async () => {
    const sql = await readFile(schedulesMigrationPath, 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS schedules');
    expect(sql).toContain('organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE');
    expect(sql).toContain('area_id UUID REFERENCES areas (id) ON DELETE SET NULL');
    expect(sql).toContain('period_start DATE NOT NULL');
    expect(sql).toContain('period_end DATE NOT NULL');
    expect(sql).toContain('created_by_user_id UUID NOT NULL REFERENCES users (id)');
  });

  it('enforces one schedule per organization, area, and period including global schedules', async () => {
    const sql = await readFile(schedulesMigrationPath, 'utf8');
    expect(sql).toContain('UNIQUE (organization_id, area_id, period_start)');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS schedules_organization_period_global_idx');
    expect(sql).toContain('WHERE area_id IS NULL');
  });

  it('adds tenant and period lookup indexes using the repository idempotent pattern', async () => {
    const sql = await readFile(schedulesMigrationPath, 'utf8');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS schedules_organization_idx');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS schedules_organization_period_idx');
  });
});

describe('0018 schedule versions migration contract', () => {
  it('creates versioned scheduling state with UUID foreign keys and bounded status', async () => {
    const sql = await readFile(scheduleVersionsMigrationPath, 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS schedule_versions');
    expect(sql).toContain('schedule_id UUID NOT NULL REFERENCES schedules (id) ON DELETE CASCADE');
    expect(sql).toContain('created_by_user_id UUID NOT NULL REFERENCES users (id)');
    expect(sql).toContain("CHECK (status IN ('DRAFT', 'PUBLISHED', 'LOCKED', 'COMPLETED'))");
    expect(sql).toContain('CHECK (version_number > 0)');
  });

  it('enforces unique version numbers and one active draft per schedule', async () => {
    const sql = await readFile(scheduleVersionsMigrationPath, 'utf8');
    expect(sql).toContain('UNIQUE (schedule_id, version_number)');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS schedule_versions_one_draft_idx');
    expect(sql).toContain("WHERE status = 'DRAFT'");
  });

  it('adds a schedule/version lookup index', async () => {
    const sql = await readFile(scheduleVersionsMigrationPath, 'utf8');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS schedule_versions_schedule_idx');
  });
});

describe('0019 shift assignments migration contract', () => {
  it('creates planned assignments with UUID foreign keys and time fields', async () => {
    const sql = await readFile(shiftAssignmentsMigrationPath, 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS shift_assignments');
    expect(sql).toContain('schedule_version_id UUID NOT NULL REFERENCES schedule_versions (id) ON DELETE CASCADE');
    expect(sql).toContain('employee_id UUID NOT NULL REFERENCES employees (id) ON DELETE CASCADE');
    expect(sql).toContain('date DATE NOT NULL');
    expect(sql).toContain('start_time TIME NOT NULL');
    expect(sql).toContain('end_time TIME NOT NULL');
    expect(sql).toContain('location TEXT');
  });

  it('adds planner and foreign-key lookup indexes without an overlap constraint', async () => {
    const sql = await readFile(shiftAssignmentsMigrationPath, 'utf8');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS shift_assignments_version_employee_date_idx');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS shift_assignments_employee_idx');
    expect(sql).toContain('Overlap/rest validation is intentionally handled');
  });
});

describe('0020 shifts schedule version migration contract', () => {
  it('adds a nullable provenance foreign key without changing existing rows', async () => {
    const sql = await readFile(shiftScheduleVersionMigrationPath, 'utf8');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS schedule_version_id UUID');
    expect(sql).toContain('REFERENCES schedule_versions (id) ON DELETE SET NULL');
  });

  it('adds an idempotent provenance lookup index', async () => {
    const sql = await readFile(shiftScheduleVersionMigrationPath, 'utf8');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS shifts_schedule_version_idx');
  });
});
