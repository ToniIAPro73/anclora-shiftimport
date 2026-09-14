import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';

const fixturePath = join(__dirname, 'artifacts', 'team-invitations-layout-fixture.json');

function readEnvValue(name: string): string {
  const file = readFileSync(join(__dirname, '..', '..', '.env.local'), 'utf8');
  const line = file.split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  const value = line?.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export default async function globalTeardown() {
  let fixture: {
    runId: string;
    createdOrganizations: string[];
    createdUsers: string[];
    protectedOrg: string | null;
    protectedCounts: Record<string, number> | null;
  };
  try {
    fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  } catch {
    return;
  }
  const sql = neon(readEnvValue('DATABASE_URL'));
  const targetName = 'groundforce';
  const groundforceId = (await sql`SELECT id FROM organizations WHERE lower(name) = ${targetName} LIMIT 1`)[0]?.id ?? null;
  if (groundforceId && fixture.createdOrganizations.includes(groundforceId)) {
    throw new Error('Refusing to clean a protected tenant');
  }

  // Deleting the organization cascades every org-scoped row
  for (const organizationId of fixture.createdOrganizations) {
    await sql`DELETE FROM organizations WHERE id = ${organizationId}`;
  }
  for (const userId of fixture.createdUsers) {
    await sql`DELETE FROM users WHERE id = ${userId}`;
  }

  if (fixture.runId) {
    await sql`DELETE FROM users WHERE email LIKE ${`%+layout${fixture.runId}@e2e.test`}`;
  }

  if (groundforceId && fixture.protectedCounts) {
    const counts = await Promise.all([
      sql`SELECT count(*)::int AS count FROM memberships WHERE organization_id = ${groundforceId}`,
      sql`SELECT count(*)::int AS count FROM organization_people WHERE organization_id = ${groundforceId}`,
      sql`SELECT count(*)::int AS count FROM employees WHERE organization_id = ${groundforceId}`,
      sql`SELECT count(*)::int AS count FROM employee_profiles WHERE organization_id = ${groundforceId}`,
      sql`SELECT count(*)::int AS count FROM user_access_invitations WHERE organization_id = ${groundforceId}`,
      sql`SELECT count(*)::int AS count FROM person_role_periods WHERE organization_id = ${groundforceId}`,
      sql`SELECT count(*)::int AS count FROM person_access_scope_periods WHERE organization_id = ${groundforceId}`,
      sql`SELECT count(*)::int AS count FROM areas WHERE organization_id = ${groundforceId}`,
      sql`SELECT count(*)::int AS count FROM shifts WHERE organization_id = ${groundforceId}`,
    ]);
    const actual = counts.map((row) => row[0].count);
    const expected = Object.values(fixture.protectedCounts);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Protected tenant Groundforce counts changed during invitations layout E2E! Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)}`);
    }
  }

  if (fixture.runId) {
    const residualOrgs = await sql`SELECT id FROM organizations WHERE name LIKE ${`%${fixture.runId}%`}`;
    const residualUsers = await sql`SELECT id FROM users WHERE email LIKE ${`%layout${fixture.runId}%`}`;
    if (residualOrgs.length > 0 || residualUsers.length > 0) {
      throw new Error(`Residual synthetic rows remain for runId ${fixture.runId}: ${residualOrgs.length} orgs, ${residualUsers.length} users`);
    }
  }

  try {
    unlinkSync(fixturePath);
  } catch {
    // Ignore unlink error if already removed
  }
}
