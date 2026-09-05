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
  const areaA = (await sql`INSERT INTO areas (organization_id, name, code) VALUES (${orgA}, 'E2E Area A', 'AREA-A') RETURNING id`)[0].id;
  const areaB = (await sql`INSERT INTO areas (organization_id, name, code) VALUES (${orgB}, 'E2E Area B', 'AREA-B') RETURNING id`)[0].id;

  const mkUser = async (email: string, name: string) =>
    (await sql`INSERT INTO users (email, password_hash, display_name) VALUES (${email}, ${hash}, ${name}) RETURNING id`)[0].id;

  const adminId = await mkUser('admin@e2e.test', 'E2E Admin');
  const empId = await mkUser('emp@e2e.test', 'E2E Uno');
  const multiId = await mkUser('multi@e2e.test', 'E2E Multi');
  const freshId = await mkUser('fresh@e2e.test', 'E2E Fresh');
  const freshTargetId = await mkUser('fresh-target@e2e.test', 'E2E Import Target');
  const unlinkedId = await mkUser('unlinked@e2e.test', 'E2E Sin Vínculo');
  const ownerId = await mkUser('owner@e2e.test', 'E2E Owner');
  const plannerId = await mkUser('planner@e2e.test', 'E2E Planner');
  const ownerBId = await mkUser('owner-b@e2e.test', 'E2E Owner B');
  const plannerBId = await mkUser('planner-b@e2e.test', 'E2E Planner B');
  const employeeBId = await mkUser('employee-b@e2e.test', 'E2E Employee B');

  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${adminId}, ${orgA}, 'ADMIN')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${empId}, ${orgA}, 'EMPLOYEE')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${multiId}, ${orgA}, 'EMPLOYEE')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${multiId}, ${orgB}, 'ADMIN')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${freshId}, ${orgFresh}, 'ADMIN')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${freshTargetId}, ${orgFresh}, 'EMPLOYEE')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${unlinkedId}, ${orgA}, 'EMPLOYEE')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${ownerId}, ${orgA}, 'OWNER')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role, scoped_area_id) VALUES (${plannerId}, ${orgA}, 'PLANNER', ${areaA})`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${ownerBId}, ${orgB}, 'OWNER')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role, scoped_area_id) VALUES (${plannerBId}, ${orgB}, 'PLANNER', ${areaB})`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${employeeBId}, ${orgB}, 'EMPLOYEE')`;

  const empA1 = (await sql`INSERT INTO employees (organization_id, name, user_id, external_employee_id, area_id) VALUES (${orgA}, 'E2E Uno', ${empId}, 'E001', ${areaA}) RETURNING id`)[0].id;
  const empA2 = (await sql`INSERT INTO employees (organization_id, name, user_id, external_employee_id, area_id) VALUES (${orgA}, 'E2E Dos', ${multiId}, 'E002', ${areaA}) RETURNING id`)[0].id;
  const empFresh = (await sql`INSERT INTO employees (organization_id, name, user_id) VALUES (${orgFresh}, 'E2E Fresh', ${freshId}) RETURNING id`)[0].id;
  const empB1 = (await sql`INSERT INTO employees (organization_id, name, user_id, external_employee_id, area_id) VALUES (${orgB}, 'E2E B Employee', ${employeeBId}, 'B001', ${areaB}) RETURNING id`)[0].id;

  const importB = (await sql`
    INSERT INTO imports (
      organization_id, imported_by_user_id, employee_id, file_name, source_format,
      period_year, period_month, period_label, import_mode, period_kind, scope_type,
      area_id, employee_count, shift_count, created_shift_count, file_fingerprint,
      context_fingerprint
    ) VALUES (
      ${orgB}, ${ownerBId}, ${empB1}, 'org-b.csv', 'CSV', 2026, 9, 'Septiembre 2026',
      'individual', 'single', 'area', ${areaB}, 1, 1, 1,
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
    ) RETURNING id
  `)[0].id;

  // Fixed days of the current month; the month grid renders all of them.
  const now = new Date();
  const day = (d: number) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const shiftToday = (await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, location, origin) VALUES (${orgA}, ${empA1}, ${day(now.getDate())}, '09:00', '17:00', 'Portal E2E', 'MAN') RETURNING id`)[0].id;
  const shiftEnglish = (await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, location, origin) VALUES (${orgA}, ${empA1}, ${day(now.getDate())}, '18:00', '22:00', 'Portal E2E EN', 'MAN') RETURNING id`)[0].id;
  // A1: 08:00-16:00; A2 same day 14:00-22:00 (multi-employee coexistence).
  await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, location, origin) VALUES (${orgA}, ${empA1}, ${day(10)}, '08:00', '16:00', 'Regular', 'MAN')`;
  await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, location, origin) VALUES (${orgA}, ${empA1}, ${day(12)}, '08:00', '16:00', 'Regular', 'MAN')`;
  const shiftA2 = (await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, location, origin) VALUES (${orgA}, ${empA2}, ${day(10)}, '14:00', '22:00', 'Regular', 'IMP') RETURNING id`)[0].id;
  const shiftB = (await sql`INSERT INTO shifts (organization_id, employee_id, import_id, area_id, date, start_time, end_time, location, origin) VALUES (${orgB}, ${empB1}, ${importB}, ${areaB}, ${day(14)}, '09:00', '17:00', 'Org B only', 'IMP') RETURNING id`)[0].id;

  // One foreign audit row makes the audit endpoint's tenant filter observable.
  await sql`INSERT INTO organization_audit_events (organization_id, actor_user_id, event_type, target_type, target_id, metadata) VALUES (${orgB}, ${ownerBId}, 'AREA_CREATED', 'AREA', ${areaB}, ${JSON.stringify({ marker: 'org-b-only' })}::jsonb)`;

  mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
  writeFileSync(FIXTURE_PATH, JSON.stringify({
    password: PASSWORD,
    orgA, orgB, orgFresh,
    adminId, empId, multiId, freshId, freshTargetId, unlinkedId, ownerId, plannerId, ownerBId, plannerBId, employeeBId,
    empA1, empA2, empFresh, empB1, areaA, areaB, importB, shiftB, shiftToday, shiftEnglish, shiftA2,
    orgAName: 'E2E Org A',
    orgBName: 'E2E Org B',
    emails: {
      admin: 'admin@e2e.test',
      emp: 'emp@e2e.test',
      multi: 'multi@e2e.test',
      fresh: 'fresh@e2e.test',
      freshTarget: 'fresh-target@e2e.test',
      unlinked: 'unlinked@e2e.test',
      owner: 'owner@e2e.test',
      planner: 'planner@e2e.test',
      ownerB: 'owner-b@e2e.test',
      plannerB: 'planner-b@e2e.test',
      employeeB: 'employee-b@e2e.test',
    },
  }, null, 2));
  console.log('[e2e] fixtures seeded');
}
