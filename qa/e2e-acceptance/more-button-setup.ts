import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { hashPassword } from '../../api/_lib/passwords.js';

export const FIXTURE_PATH = join(__dirname, 'artifacts', 'more-button-fixture.json');
const GROUND_FORCE_ID = 'ecbebcf6-787d-4b0f-be32-d67be64ce3b1';

function databaseUrl(): string {
  const envFile = readFileSync(join(__dirname, '..', '..', '.env.local'), 'utf8');
  const line = envFile.split(/\r?\n/).find((item) => item.startsWith('DATABASE_URL='));
  const value = line?.slice('DATABASE_URL='.length).trim().replace(/^['"]|['"]$/g, '');
  if (!value) throw new Error('DATABASE_URL not found in .env.local');
  return value;
}

export const protectedCounts = async (sql: ReturnType<typeof neon>) => {
  const rows = await sql`
    SELECT json_build_object(
      'organizations', (SELECT count(*)::int FROM organizations WHERE id = ${GROUND_FORCE_ID}),
      'memberships', (SELECT count(*)::int FROM memberships WHERE organization_id = ${GROUND_FORCE_ID}),
      'people', (SELECT count(*)::int FROM organization_people WHERE organization_id = ${GROUND_FORCE_ID}),
      'employees', (SELECT count(*)::int FROM employees WHERE organization_id = ${GROUND_FORCE_ID}),
      'employee_profiles', (SELECT count(*)::int FROM employee_profiles WHERE organization_id = ${GROUND_FORCE_ID}),
      'areas', (SELECT count(*)::int FROM areas WHERE organization_id = ${GROUND_FORCE_ID}),
      'imports', (SELECT count(*)::int FROM imports WHERE organization_id = ${GROUND_FORCE_ID}),
      'shifts', (SELECT count(*)::int FROM shifts WHERE organization_id = ${GROUND_FORCE_ID}),
      'schedules', (SELECT count(*)::int FROM schedules WHERE organization_id = ${GROUND_FORCE_ID}),
      'change_requests', (SELECT count(*)::int FROM change_requests WHERE organization_id = ${GROUND_FORCE_ID}),
      'notifications', (SELECT count(*)::int FROM notifications WHERE organization_id = ${GROUND_FORCE_ID}),
      'invitations', (SELECT count(*)::int FROM user_access_invitations WHERE organization_id = ${GROUND_FORCE_ID})
    ) AS counts
  `;
  return rows[0].counts as Record<string, number>;
};

export default async function globalSetup() {
  const sql = neon(databaseUrl());
  const runId = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  const organizationName = `E2E-N-MORE-${runId}`;
  const email = `owner-${runId.toLowerCase()}@e2e.test`;
  const password = 'E2E-N-More-1234';
  const fixture: Record<string, unknown> = {
    runId,
    organizationName,
    email,
    password,
    organizationId: null,
    userId: null,
    employeeId: null,
    protectedCounts: await protectedCounts(sql),
  };

  mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
  writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2));

  const organizationId = (await sql`
    INSERT INTO organizations (name, type, plan) VALUES (${organizationName}, 'company', 'team') RETURNING id
  `)[0].id as string;
  fixture.organizationId = organizationId;
  writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2));

  const userId = (await sql`
    INSERT INTO users (email, password_hash, display_name) VALUES (${email}, ${hashPassword(password)}, ${`E2E N More Owner ${runId}`}) RETURNING id
  `)[0].id as string;
  fixture.userId = userId;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${userId}, ${organizationId}, 'OWNER')`;

  const employeeId = (await sql`
    INSERT INTO employees (organization_id, name, external_employee_id, user_id)
    VALUES (${organizationId}, ${`E2E N More Employee ${runId}`}, ${`N-MORE-${runId}`}, ${userId})
    RETURNING id
  `)[0].id as string;
  fixture.employeeId = employeeId;
  writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2));

  const date = '2026-09-10';
  await sql`
    INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, location, origin, shift_type, counts_as_work)
    VALUES
      (${organizationId}, ${employeeId}, ${date}, '08:00', '11:00', 'Regular', 'MAN', 'Regular', true),
      (${organizationId}, ${employeeId}, ${date}, '11:00', '12:00', 'Ausencia', 'MAN', 'Ausencia', false),
      (${organizationId}, ${employeeId}, ${date}, '12:00', '16:00', 'Regular', 'MAN', 'Regular', true)
  `;
  console.log(`[e2e-more] fixture seeded; runId=${runId}`);
}
