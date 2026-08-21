/* Seeds E2E fixtures into the Neon dev branch. Never prints secrets. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { hashPassword } from '../../api/_lib/passwords.js';

const here = __dirname;
const root = join(here, '..', '..');

export const FIXTURE_PATH = join(here, 'artifacts', 'local-fixture.json');

function loadDatabaseUrl(): string {
  const envFile = readFileSync(join(root, '.env.development.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^DATABASE_URL=(.+)$/);
    if (match) {
      return match[1].trim().replace(/^"|"$/g, '');
    }
  }
  throw new Error('DATABASE_URL not found in .env.development.local');
}

const PASSWORD = 'E2e-pass-1234';

export default async function globalSetup() {
  const sql = neon(loadDatabaseUrl());
  const hash = hashPassword(PASSWORD);

  // Org A exercises administrative scenarios (member management, team
  // import) that are Team-plan capabilities (server-side PLAN_LIMIT gate,
  // api/_lib/plans.js) — the fixture must declare that plan explicitly.
  // Org B and Org Fresh only cover viewing/migration flows → default 'free'.
  const orgA = (await sql`INSERT INTO organizations (name, type, plan) VALUES ('E2E Org A', 'company', 'team') RETURNING id`)[0].id;
  const orgB = (await sql`INSERT INTO organizations (name, type) VALUES ('E2E Org B', 'company') RETURNING id`)[0].id;
  const orgFresh = (await sql`INSERT INTO organizations (name, type) VALUES ('E2E Fresh', 'personal') RETURNING id`)[0].id;

  const mkUser = async (email: string, name: string) =>
    (await sql`INSERT INTO users (email, password_hash, display_name) VALUES (${email}, ${hash}, ${name}) RETURNING id`)[0].id;

  const adminId = await mkUser('admin@e2e.test', 'E2E Admin');
  const empId = await mkUser('emp@e2e.test', 'E2E Uno');
  const multiId = await mkUser('multi@e2e.test', 'E2E Multi');
  const freshId = await mkUser('fresh@e2e.test', 'E2E Fresh');
  const unlinkedId = await mkUser('unlinked@e2e.test', 'E2E Sin Vínculo');

  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${adminId}, ${orgA}, 'ADMIN')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${empId}, ${orgA}, 'EMPLOYEE')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${multiId}, ${orgA}, 'EMPLOYEE')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${multiId}, ${orgB}, 'ADMIN')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${freshId}, ${orgFresh}, 'ADMIN')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${unlinkedId}, ${orgA}, 'EMPLOYEE')`;

  const empA1 = (await sql`INSERT INTO employees (organization_id, name, user_id, external_employee_id) VALUES (${orgA}, 'E2E Uno', ${empId}, 'E001') RETURNING id`)[0].id;
  const empA2 = (await sql`INSERT INTO employees (organization_id, name, user_id, external_employee_id) VALUES (${orgA}, 'E2E Dos', ${multiId}, 'E002') RETURNING id`)[0].id;
  const empFresh = (await sql`INSERT INTO employees (organization_id, name, user_id) VALUES (${orgFresh}, 'E2E Fresh', ${freshId}) RETURNING id`)[0].id;

  // Fixed days of the current month; the month grid renders all of them.
  const now = new Date();
  const day = (d: number) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  // A1: 08:00-16:00; A2 same day 14:00-22:00 (multi-employee coexistence).
  await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, location, origin) VALUES (${orgA}, ${empA1}, ${day(10)}, '08:00', '16:00', 'Regular', 'MAN')`;
  await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, location, origin) VALUES (${orgA}, ${empA1}, ${day(12)}, '08:00', '16:00', 'Regular', 'MAN')`;
  await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, location, origin) VALUES (${orgA}, ${empA2}, ${day(10)}, '14:00', '22:00', 'Regular', 'IMP')`;

  mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
  writeFileSync(FIXTURE_PATH, JSON.stringify({
    password: PASSWORD,
    orgA, orgB, orgFresh,
    adminId, empId, multiId, freshId, unlinkedId,
    empA1, empA2, empFresh,
    orgAName: 'E2E Org A',
    orgBName: 'E2E Org B',
    emails: {
      admin: 'admin@e2e.test',
      emp: 'emp@e2e.test',
      multi: 'multi@e2e.test',
      fresh: 'fresh@e2e.test',
      unlinked: 'unlinked@e2e.test',
    },
  }, null, 2));
  console.log('[e2e] fixtures seeded');
}
