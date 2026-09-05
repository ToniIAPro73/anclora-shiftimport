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
const shiftAssignmentImportMigrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0021_shift_assignments_import_id.sql');
const shiftAcknowledgementsMigrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0022_shift_acknowledgements.sql');
const shiftCommentsMigrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0023_shift_comments.sql');
const changeRequestsMigrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0024_change_requests.sql');
const notificationsMigrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0025_notifications.sql');
const approvalPolicyMigrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0027_approval_policy.sql');
const approvalRequestsMigrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0028_approval_requests.sql');
const approvalDecisionMigrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0029_approval_decision_metadata.sql');
const approvalRejectionMigrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0030_approval_rejection_metadata.sql');

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

describe('0021 shift assignment import provenance migration contract', () => {
  it('adds only the nullable assignment-to-import provenance FK', async () => {
    const sql = await readFile(shiftAssignmentImportMigrationPath, 'utf8');
    const executableSql = sql.replace(/--.*$/gm, '');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS import_id UUID');
    expect(sql).toContain('REFERENCES imports (id) ON DELETE SET NULL');
    expect(executableSql).not.toContain('schedule_version_id');
    expect(executableSql).not.toContain('CREATE TABLE import_schedule');
  });

  it('adds an idempotent provenance lookup index', async () => {
    const sql = await readFile(shiftAssignmentImportMigrationPath, 'utf8');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS shift_assignments_import_idx');
  });
});

describe('0022 shift acknowledgements migration contract', () => {
  it('creates an independent acknowledgement state with a bounded status', async () => {
    const sql = await readFile(shiftAcknowledgementsMigrationPath, 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS shift_acknowledgements');
    expect(sql).toContain("CHECK (status IN ('PENDING', 'ACKNOWLEDGED'))");
    expect(sql).toContain('acknowledged_at TIMESTAMPTZ');
    expect(sql).toContain('shift_acknowledgements_shift_unique UNIQUE (shift_id)');
  });

  it('enforces that the acknowledgement employee owns the referenced shift', async () => {
    const sql = await readFile(shiftAcknowledgementsMigrationPath, 'utf8');
    expect(sql).toContain('FOREIGN KEY (shift_id, employee_id)');
    expect(sql).toContain('REFERENCES shifts (id, employee_id) ON DELETE CASCADE');
    expect(sql).toContain('shifts_id_employee_unique_idx');
  });

  it('is additive and indexed for employee/status reads', async () => {
    const sql = await readFile(shiftAcknowledgementsMigrationPath, 'utf8');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS shift_acknowledgements_employee_idx');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS shift_acknowledgements_status_idx');
    expect(sql).not.toContain('ALTER TABLE shifts\n  ADD COLUMN');
  });
});

describe('0023 shift comments migration contract', () => {
  it('creates append-only comments with bounded non-empty body text', async () => {
    const sql = await readFile(shiftCommentsMigrationPath, 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS shift_comments');
    expect(sql).toContain('body TEXT NOT NULL');
    expect(sql).toContain('char_length(btrim(body)) BETWEEN 1 AND 2000');
    expect(sql).not.toContain('UPDATE shift_comments');
    expect(sql).not.toContain('DELETE FROM shift_comments');
  });

  it('enforces that a comment employee owns the referenced shift', async () => {
    const sql = await readFile(shiftCommentsMigrationPath, 'utf8');
    expect(sql).toContain('FOREIGN KEY (shift_id, employee_id)');
    expect(sql).toContain('REFERENCES shifts (id, employee_id) ON DELETE CASCADE');
  });

  it('adds chronological shift and employee lookup indexes', async () => {
    const sql = await readFile(shiftCommentsMigrationPath, 'utf8');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS shift_comments_shift_created_idx');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS shift_comments_employee_idx');
  });
});

describe('0024 change requests migration contract', () => {
  it('creates an independent bounded change-request lifecycle', async () => {
    const sql = await readFile(changeRequestsMigrationPath, 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS change_requests');
    expect(sql).toContain("CHECK (request_type IN ('TIME_CHANGE', 'OTHER'))");
    expect(sql).toContain("CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'))");
    expect(sql).toContain('char_length(btrim(reason)) BETWEEN 1 AND 2000');
    expect(sql).not.toContain('ALTER TABLE shifts');
  });

  it('keeps approval metadata reserved for the approval phase', async () => {
    const sql = await readFile(changeRequestsMigrationPath, 'utf8');
    expect(sql).toContain('resolved_at TIMESTAMPTZ');
    expect(sql).toContain('resolved_by_user_id UUID REFERENCES users');
  });

  it('enforces shift ownership and adds tenant/status lookup indexes', async () => {
    const sql = await readFile(changeRequestsMigrationPath, 'utf8');
    expect(sql).toContain('FOREIGN KEY (shift_id, employee_id)');
    expect(sql).toContain('REFERENCES shifts (id, employee_id) ON DELETE CASCADE');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS change_requests_employee_status_idx');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS change_requests_shift_idx');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS change_requests_organization_idx');
  });
});

describe('0025 notifications migration contract', () => {
  it('creates an in-app-only recipient-scoped notification table', async () => {
    const sql = await readFile(notificationsMigrationPath, 'utf8');
    const executableSql = sql.replace(/--.*$/gm, '');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS notifications');
    expect(sql).toContain('user_id UUID NOT NULL REFERENCES users');
    expect(sql).toContain('organization_id UUID NOT NULL REFERENCES organizations');
    expect(sql).toContain("'SHIFT_PUBLISHED'");
    expect(sql).toContain("'CHANGE_REQUEST_RESOLVED'");
    expect(executableSql).not.toContain('email');
    expect(executableSql).not.toContain('push');
    expect(executableSql).not.toContain('sms');
  });

  it('supports unread queries and idempotent event generation', async () => {
    const sql = await readFile(notificationsMigrationPath, 'utf8');
    expect(sql).toContain('read_at TIMESTAMPTZ');
    expect(sql).toContain('notifications_user_read_created_idx');
    expect(sql).toContain('notifications_user_type_resource_unique UNIQUE');
  });
});

describe('0027 approval policy migration contract', () => {
  it('adds a safe organization default and constrained policy values', async () => {
    const sql = await readFile(approvalPolicyMigrationPath, 'utf8');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS approval_policy TEXT NOT NULL DEFAULT');
    expect(sql).toContain("CHECK (approval_policy IN ('NO_APPROVAL', 'AREA_RESPONSIBLE', 'ORGANIZATION_ADMIN'))");
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS organizations_approval_policy_check');
  });

  it('creates tenant-scoped N:N area responsibility mappings with indexes', async () => {
    const sql = await readFile(approvalPolicyMigrationPath, 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS area_responsibles');
    expect(sql).toContain('area_id UUID NOT NULL REFERENCES areas');
    expect(sql).toContain('user_id UUID NOT NULL REFERENCES users');
    expect(sql).toContain('organization_id UUID NOT NULL REFERENCES organizations');
    expect(sql).toContain('PRIMARY KEY (area_id, user_id)');
    expect(sql).toContain('area_responsibles_organization_idx');
  });
});

describe('0028 approval requests migration contract', () => {
  it('creates one tenant-scoped approval envelope per change request', async () => {
    const sql = await readFile(approvalRequestsMigrationPath, 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS approval_requests');
    expect(sql).toContain('organization_id UUID NOT NULL REFERENCES organizations');
    expect(sql).toContain('change_request_id UUID NOT NULL REFERENCES change_requests');
    expect(sql).toContain("CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'))");
    expect(sql).toContain("CHECK (policy_snapshot IN ('NO_APPROVAL', 'AREA_RESPONSIBLE', 'ORGANIZATION_ADMIN'))");
    expect(sql).toContain('UNIQUE (change_request_id)');
  });

  it('extends the existing in-app channel for approver discovery', async () => {
    const sql = await readFile(approvalRequestsMigrationPath, 'utf8');
    expect(sql).toContain("'APPROVAL_REQUEST_CREATED'");
    expect(sql).toContain("'APPROVAL_REQUEST'");
    expect(sql).toContain('approval_requests_organization_status_idx');
  });
});

describe('0029 approval decision metadata migration contract', () => {
  it('adds auditable approval actor and timestamp fields', async () => {
    const sql = await readFile(approvalDecisionMigrationPath, 'utf8');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES users');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ');
  });
});

describe('0030 approval rejection metadata migration contract', () => {
  it('adds auditable rejection fields and prevents rejected requests without a reason', async () => {
    const sql = await readFile(approvalRejectionMigrationPath, 'utf8');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS rejected_by_user_id UUID REFERENCES users');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS rejection_reason TEXT');
    expect(sql).toContain('approval_requests_rejected_reason_check');
  });
});
