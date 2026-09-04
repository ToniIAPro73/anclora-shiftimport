import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0013_membership_roles_owner.sql');
const ownerInvariantMigrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0014_single_owner_per_organization.sql');
const scopedAreaMigrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0015_membership_scoped_area.sql');
const auditEventsMigrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0016_organization_audit_events.sql');

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
