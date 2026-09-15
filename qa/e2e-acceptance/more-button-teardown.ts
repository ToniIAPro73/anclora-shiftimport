import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { FIXTURE_PATH, protectedCounts } from './more-button-setup.js';

const GROUND_FORCE_ID = 'ecbebcf6-787d-4b0f-be32-d67be64ce3b1';

function databaseUrl(): string {
  const envFile = readFileSync(join(__dirname, '..', '..', '.env.local'), 'utf8');
  const line = envFile.split(/\r?\n/).find((item) => item.startsWith('DATABASE_URL='));
  const value = line?.slice('DATABASE_URL='.length).trim().replace(/^['"]|['"]$/g, '');
  if (!value) throw new Error('DATABASE_URL not found in .env.local');
  return value;
}

export default async function globalTeardown() {
  let fixture: { runId: string; organizationName: string; email: string; organizationId: string | null; userId: string | null; protectedCounts: Record<string, number> };
  try {
    fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  } catch {
    throw new Error('More-button fixture is missing; teardown cannot prove cleanup');
  }

  const sql = neon(databaseUrl());
  const organization = (await sql`
    SELECT id FROM organizations WHERE id = ${fixture.organizationId} OR name = ${fixture.organizationName} LIMIT 1
  `)[0]?.id as string | undefined;
  if (organization === GROUND_FORCE_ID) throw new Error('Refusing to clean the protected Groundforce tenant');
  if (organization) await sql`DELETE FROM organizations WHERE id = ${organization}`;
  if (fixture.userId) await sql`DELETE FROM users WHERE id = ${fixture.userId}`;
  await sql`DELETE FROM users WHERE email = ${fixture.email}`;

  const residual = await sql`
    SELECT json_build_object(
      'organizations', (SELECT count(*)::int FROM organizations WHERE name = ${fixture.organizationName}),
      'users', (SELECT count(*)::int FROM users WHERE email = ${fixture.email}),
      'memberships', (SELECT count(*)::int FROM memberships m JOIN organizations o ON o.id = m.organization_id WHERE o.name = ${fixture.organizationName}),
      'people', (SELECT count(*)::int FROM organization_people p JOIN organizations o ON o.id = p.organization_id WHERE o.name = ${fixture.organizationName}),
      'employees', (SELECT count(*)::int FROM employees e JOIN organizations o ON o.id = e.organization_id WHERE o.name = ${fixture.organizationName}),
      'employee_profiles', (SELECT count(*)::int FROM employee_profiles p JOIN organizations o ON o.id = p.organization_id WHERE o.name = ${fixture.organizationName}),
      'areas', (SELECT count(*)::int FROM areas a JOIN organizations o ON o.id = a.organization_id WHERE o.name = ${fixture.organizationName}),
      'periods', (SELECT count(*)::int FROM person_role_periods p JOIN organizations o ON o.id = p.organization_id WHERE o.name = ${fixture.organizationName}) + (SELECT count(*)::int FROM person_access_scope_periods p JOIN organizations o ON o.id = p.organization_id WHERE o.name = ${fixture.organizationName}),
      'invitations', (SELECT count(*)::int FROM user_access_invitations i JOIN organizations o ON o.id = i.organization_id WHERE o.name = ${fixture.organizationName}),
      'imports', (SELECT count(*)::int FROM imports i JOIN organizations o ON o.id = i.organization_id WHERE o.name = ${fixture.organizationName}),
      'shifts', (SELECT count(*)::int FROM shifts s JOIN organizations o ON o.id = s.organization_id WHERE o.name = ${fixture.organizationName}),
      'change_requests', (SELECT count(*)::int FROM change_requests r JOIN organizations o ON o.id = r.organization_id WHERE o.name = ${fixture.organizationName}),
      'notifications', (SELECT count(*)::int FROM notifications n JOIN organizations o ON o.id = n.organization_id WHERE o.name = ${fixture.organizationName})
    ) AS residual
  `;
  const remaining = residual[0].residual as Record<string, number>;
  if (Object.values(remaining).some((value) => Number(value) !== 0)) {
    throw new Error(`Teardown left run-scoped rows for ${fixture.runId}: ${JSON.stringify(remaining)}`);
  }

  const afterGroundforce = await protectedCounts(sql);
  if (JSON.stringify(afterGroundforce) !== JSON.stringify(fixture.protectedCounts)) {
    throw new Error(`Groundforce invariants changed: expected=${JSON.stringify(fixture.protectedCounts)} actual=${JSON.stringify(afterGroundforce)}`);
  }
  unlinkSync(FIXTURE_PATH);
  console.log(`[e2e-more] teardown PASS; runId=${fixture.runId}; residuals=0; groundforce=unchanged`);
}
