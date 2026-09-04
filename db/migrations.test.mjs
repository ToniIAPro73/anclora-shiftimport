import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0013_membership_roles_owner.sql');
const ownerInvariantMigrationPath = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations', '0014_single_owner_per_organization.sql');

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
