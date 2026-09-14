import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';

const fixturePath = join(__dirname, 'artifacts', 'csv-bulk-production-fixture.json');

function readEnvValue(name: string): string {
  const file = readFileSync(join(__dirname, '..', '..', '.env.local'), 'utf8');
  const line = file.split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  const value = line?.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export default async function globalTeardown() {
  let fixture: { runId: string; createdOrganizations: string[]; createdUsers: string[]; createdRecipientEmails?: string[]; protectedOrg: string | null; protectedCounts: Record<string, number> | null };
  try {
    fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  } catch {
    return;
  }
  const sql = neon(readEnvValue('DATABASE_URL'));
  const groundforceId = (await sql`SELECT id FROM organizations WHERE lower(name) = lower('Groundforce') LIMIT 1`)[0]?.id ?? null;
  if (groundforceId && fixture.createdOrganizations.includes(groundforceId)) throw new Error('Refusing to clean a protected tenant');

  // Deleting the organization cascades every org-scoped row (memberships,
  // organization_people, employees, employee_profiles, person_role_periods,
  // person_access_scope_periods, areas, user_access_invitations) — proven by
  // the same pattern in team-access-teardown.ts. Users are deleted
  // separately since they are NOT organization-scoped rows.
  for (const organizationId of fixture.createdOrganizations) {
    await sql`DELETE FROM organizations WHERE id = ${organizationId}`;
  }
  for (const userId of fixture.createdUsers) {
    await sql`DELETE FROM users WHERE id = ${userId}`;
  }
  if (fixture.createdRecipientEmails?.length) {
    await sql`DELETE FROM users WHERE email = ANY(${fixture.createdRecipientEmails})`;
  }
  // Belt-and-suspenders: catch any synthetic row this run created that the
  // explicit id lists above missed (e.g. a bulk-invited user whose email
  // wasn't pre-declared) — identified by runId, never by a loose name match.
  if (fixture.runId) {
    await sql`DELETE FROM users WHERE email LIKE ${`%+csvbulk${fixture.runId}@e2e.test`}`;
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
    ]);
    const actual = counts.map((row) => row[0].count);
    const expected = Object.values(fixture.protectedCounts);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Protected tenant counts changed during CSV bulk-import E2E');
  }

  // Final residual check, scoped to this run's runId — zero rows expected.
  if (fixture.runId) {
    const residualOrgs = await sql`SELECT id FROM organizations WHERE name LIKE ${`%${fixture.runId}%`}`;
    const residualUsers = await sql`SELECT id FROM users WHERE email LIKE ${`%csvbulk${fixture.runId}%`}`;
    if (residualOrgs.length > 0 || residualUsers.length > 0) {
      throw new Error(`Residual synthetic rows remain for runId ${fixture.runId}: ${residualOrgs.length} orgs, ${residualUsers.length} users`);
    }
  }

  unlinkSync(fixturePath);
}
