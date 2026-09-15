/* Removes only the run-scoped E2E fixture created by local-setup.ts. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { FIXTURE_PATH } from './local-setup.js';

const here = __dirname;

function loadDatabaseUrl(): string {
  const envFile = readFileSync(join(here, '..', '..', '.env.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^DATABASE_URL=(.+)$/);
    if (match) {
      return match[1].trim().replace(/^"|"$/g, '');
    }
  }
  throw new Error('DATABASE_URL not found');
}

export default async function globalTeardown() {
  let fixture;
  try {
    fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  } catch {
    return;
  }
  const sql = neon(loadDatabaseUrl());
  // Deleting organizations cascades their memberships, people, schedules,
  // assignments, shifts, imports, requests and notifications.
  for (const org of [fixture.orgA, fixture.orgB, fixture.orgFresh]) {
    await sql`DELETE FROM organizations WHERE id = ${org}`;
  }
  for (const userId of [
    fixture.adminId, fixture.empId, fixture.multiId, fixture.freshId,
    fixture.freshTargetId, fixture.unlinkedId, fixture.ownerId,
    fixture.adminEmployeeId, fixture.plannerId, fixture.plannerNoAreaId,
    fixture.plannerGlobalId, fixture.inactiveEmployeeUserId, fixture.ownerBId,
    fixture.plannerBId, fixture.employeeBId,
  ]) {
    await sql`DELETE FROM users WHERE id = ${userId}`;
  }
  const remaining = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM organizations WHERE name LIKE ${`E2E-SHIFT-${fixture.runId}-%`}) AS organizations,
      (SELECT COUNT(*)::int FROM users WHERE email LIKE ${`%-${fixture.runId.toLowerCase()}@e2e.test`}) AS users,
      (SELECT COUNT(*)::int FROM memberships m JOIN organizations o ON o.id = m.organization_id WHERE o.name LIKE ${`E2E-SHIFT-${fixture.runId}-%`}) AS memberships,
      (SELECT COUNT(*)::int FROM employees e JOIN organizations o ON o.id = e.organization_id WHERE o.name LIKE ${`E2E-SHIFT-${fixture.runId}-%`}) AS employees
  `;
  if (Object.values(remaining[0] ?? {}).some((value) => Number(value) !== 0)) {
    throw new Error(`E2E teardown left run-scoped rows for ${fixture.runId}`);
  }
  console.log(`[e2e] fixtures removed; runId=${fixture.runId}; residuals=0`);
}
