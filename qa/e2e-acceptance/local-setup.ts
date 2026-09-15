/* Seeds run-scoped E2E fixtures into Neon main. Never prints secrets. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { hashPassword } from '../../api/_lib/passwords.js';

const here = __dirname;
const root = join(here, '..', '..');

export const FIXTURE_PATH = join(here, 'artifacts', 'local-fixture.json');

function loadDatabaseUrl(): string {
  const envFile = readFileSync(join(root, '.env.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^DATABASE_URL=(.+)$/);
    if (match) {
      return match[1].trim().replace(/^"|"$/g, '');
    }
  }
  throw new Error('DATABASE_URL not found in .env.local');
}

const PASSWORD = 'E2e-pass-1234';

export default async function globalSetup() {
  const sql = neon(loadDatabaseUrl());
  const hash = hashPassword(PASSWORD);
  const runId = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  const email = (local: string) => `${local}-${runId.toLowerCase()}@e2e.test`;

  // Org A exercises administrative scenarios (member management, team
  // import) that are Team-plan capabilities (server-side PLAN_LIMIT gate,
  // api/_lib/plans.js) — the fixture must declare that plan explicitly.
  // Org B and Org Fresh only cover viewing/migration flows → default 'free'.
  const orgAName = `E2E Org A · E2E-SHIFT-${runId}`;
  const orgBName = `E2E Org B · E2E-SHIFT-${runId}`;
  const orgFreshName = `E2E Fresh · E2E-SHIFT-${runId}`;
  const orgA = (await sql`INSERT INTO organizations (name, type, plan) VALUES (${orgAName}, 'company', 'team') RETURNING id`)[0].id;
  const orgB = (await sql`INSERT INTO organizations (name, type) VALUES (${orgBName}, 'company') RETURNING id`)[0].id;
  const orgFresh = (await sql`INSERT INTO organizations (name, type, plan) VALUES (${orgFreshName}, 'personal', 'personal') RETURNING id`)[0].id;
  const areaA = (await sql`INSERT INTO areas (organization_id, name, code) VALUES (${orgA}, 'E2E Area A', ${`AREA-${runId}-A`}) RETURNING id`)[0].id;
  const areaB = (await sql`INSERT INTO areas (organization_id, name, code) VALUES (${orgB}, 'E2E Area B', ${`AREA-${runId}-B`}) RETURNING id`)[0].id;

  const mkUser = async (email: string, name: string) =>
    (await sql`INSERT INTO users (email, password_hash, display_name) VALUES (${email}, ${hash}, ${name}) RETURNING id`)[0].id;

  const adminId = await mkUser(email('admin'), `E2E Admin ${runId}`);
  const empId = await mkUser(email('emp'), `E2E Uno ${runId}`);
  const multiId = await mkUser(email('multi'), `E2E Multi ${runId}`);
  const freshId = await mkUser(email('fresh'), `E2E Fresh ${runId}`);
  const freshTargetId = await mkUser(email('fresh-target'), `E2E Import Target ${runId}`);
  const unlinkedId = await mkUser(email('unlinked'), `E2E Sin Vínculo ${runId}`);
  const ownerId = await mkUser(email('owner'), `E2E Owner ${runId}`);
  const adminEmployeeId = await mkUser(email('admin-employee'), `E2E Admin Employee ${runId}`);
  const plannerId = await mkUser(email('planner'), `E2E Planner ${runId}`);
  const plannerNoAreaId = await mkUser(email('planner-no-area'), `E2E Planner Without Area ${runId}`);
  const plannerGlobalId = await mkUser(email('planner-global'), `E2E Global Planner ${runId}`);
  const inactiveEmployeeUserId = await mkUser(email('inactive-employee'), `E2E Inactive Employee ${runId}`);
  const ownerBId = await mkUser(email('owner-b'), `E2E Owner B ${runId}`);
  const plannerBId = await mkUser(email('planner-b'), `E2E Planner B ${runId}`);
  const employeeBId = await mkUser(email('employee-b'), `E2E Employee B ${runId}`);

  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${adminId}, ${orgA}, 'ADMIN')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${empId}, ${orgA}, 'EMPLOYEE')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${multiId}, ${orgA}, 'EMPLOYEE')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${multiId}, ${orgB}, 'ADMIN')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${freshId}, ${orgFresh}, 'ADMIN')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${freshTargetId}, ${orgFresh}, 'EMPLOYEE')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${unlinkedId}, ${orgA}, 'EMPLOYEE')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${ownerId}, ${orgA}, 'OWNER')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${adminEmployeeId}, ${orgA}, 'ADMIN')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role, scoped_area_id) VALUES (${plannerId}, ${orgA}, 'PLANNER', ${areaA})`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${plannerNoAreaId}, ${orgA}, 'PLANNER')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${plannerGlobalId}, ${orgFresh}, 'PLANNER')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${inactiveEmployeeUserId}, ${orgA}, 'EMPLOYEE')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${ownerBId}, ${orgB}, 'OWNER')`;
  await sql`INSERT INTO memberships (user_id, organization_id, role, scoped_area_id) VALUES (${plannerBId}, ${orgB}, 'PLANNER', ${areaB})`;
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${employeeBId}, ${orgB}, 'EMPLOYEE')`;

  const empA1 = (await sql`INSERT INTO employees (organization_id, name, user_id, external_employee_id, area_id) VALUES (${orgA}, 'E2E Uno', ${empId}, ${`E${runId}-001`}, ${areaA}) RETURNING id`)[0].id;
  const empA2 = (await sql`INSERT INTO employees (organization_id, name, user_id, external_employee_id, area_id) VALUES (${orgA}, 'E2E Dos', ${multiId}, ${`E${runId}-002`}, ${areaA}) RETURNING id`)[0].id;
  const empAdmin = (await sql`INSERT INTO employees (organization_id, name, user_id, external_employee_id, area_id) VALUES (${orgA}, 'E2E Z Admin Employee', ${adminEmployeeId}, ${`E${runId}-003`}, ${areaA}) RETURNING id`)[0].id;
  const empInactive = (await sql`INSERT INTO employees (organization_id, name, user_id, status, external_employee_id, area_id) VALUES (${orgA}, 'E2E Inactive Employee', ${inactiveEmployeeUserId}, 'inactive', ${`E${runId}-004`}, ${areaA}) RETURNING id`)[0].id;
  const empFresh = (await sql`INSERT INTO employees (organization_id, name, user_id) VALUES (${orgFresh}, 'E2E Fresh', ${freshId}) RETURNING id`)[0].id;
  const empB1 = (await sql`INSERT INTO employees (organization_id, name, user_id, external_employee_id, area_id) VALUES (${orgB}, 'E2E B Employee', ${employeeBId}, ${`B${runId}-001`}, ${areaB}) RETURNING id`)[0].id;

  const importB = (await sql`
    INSERT INTO imports (
      organization_id, imported_by_user_id, employee_id, file_name, source_format,
      period_year, period_month, period_label, import_mode, period_kind, scope_type,
      area_id, employee_count, shift_count, created_shift_count, file_fingerprint,
      context_fingerprint
    ) VALUES (
      ${orgB}, ${ownerBId}, ${empB1}, ${`org-${runId}.csv`}, 'CSV', 2026, 9, 'Septiembre 2026',
      'individual', 'single', 'area', ${areaB}, 1, 1, 1,
      ${runId.padEnd(64, '0')}, ${`context-${runId}`}
    ) RETURNING id
  `)[0].id;

  // Fixed days of the current month; the month grid renders all of them.
  const now = new Date();
  const day = (d: number) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const shiftToday = (await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, location, origin) VALUES (${orgA}, ${empA1}, ${day(now.getDate())}, '09:00', '17:00', ${`Portal E2E ${runId}`}, 'MAN') RETURNING id`)[0].id;
  const shiftEnglish = (await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, location, origin) VALUES (${orgA}, ${empA1}, ${day(now.getDate())}, '18:00', '22:00', ${`Portal E2E EN ${runId}`}, 'MAN') RETURNING id`)[0].id;
  const associatedShift = (await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, location, origin) VALUES (${orgA}, ${empA1}, '2026-09-17', '19:00', '03:00', ${`Regular ${runId}`}, 'MAN') RETURNING id`)[0].id;
  await sql`INSERT INTO change_requests (organization_id, employee_id, shift_id, request_type, reason, status) VALUES (${orgA}, ${empA1}, ${associatedShift}, 'TIME_CHANGE', 'Cambio de horario', 'PENDING')`;
  // A1: 08:00-16:00; A2 same day 14:00-22:00 (multi-employee coexistence).
  await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, location, origin) VALUES (${orgA}, ${empA1}, ${day(10)}, '08:00', '16:00', ${`Regular ${runId}`}, 'MAN')`;
  await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, location, origin) VALUES (${orgA}, ${empA1}, ${day(12)}, '08:00', '16:00', ${`Regular ${runId}`}, 'MAN')`;
  const shiftA2 = (await sql`INSERT INTO shifts (organization_id, employee_id, date, start_time, end_time, location, origin) VALUES (${orgA}, ${empA2}, ${day(10)}, '14:00', '22:00', ${`Regular import ${runId}`}, 'IMP') RETURNING id`)[0].id;
  const shiftB = (await sql`INSERT INTO shifts (organization_id, employee_id, import_id, area_id, date, start_time, end_time, location, origin) VALUES (${orgB}, ${empB1}, ${importB}, ${areaB}, ${day(14)}, '09:00', '17:00', ${`Org B only ${runId}`}, 'IMP') RETURNING id`)[0].id;

  // Published source shift used by R5 Approval Lite E2E scenarios. Change
  // requests against this row can materialize a new DRAFT without mutating
  // the published version.
  const approvalSchedule = (await sql`
    INSERT INTO schedules (organization_id, area_id, period_start, period_end, created_by_user_id)
    VALUES (${orgA}, ${areaA}, '2027-02-01', '2027-02-07', ${adminId})
    RETURNING id
  `)[0].id;
  const approvalVersion = (await sql`
    INSERT INTO schedule_versions (schedule_id, version_number, status, created_by_user_id, published_at, published_by_user_id)
    VALUES (${approvalSchedule}, 1, 'PUBLISHED', ${adminId}, NOW(), ${adminId})
    RETURNING id
  `)[0].id;
  await sql`
    INSERT INTO shift_assignments (schedule_version_id, employee_id, date, start_time, end_time, location)
    VALUES (${approvalVersion}, ${empA1}, '2027-02-03', '09:00', '17:00', ${`Approval E2E ${runId}`})
  `;
  const approvalShift = (await sql`
    INSERT INTO shifts (organization_id, employee_id, area_id, date, start_time, end_time, location, origin, schedule_version_id)
    VALUES (${orgA}, ${empA1}, ${areaA}, '2027-02-03', '09:00', '17:00', ${`Approval E2E ${runId}`}, 'schedule', ${approvalVersion})
    RETURNING id
  `)[0].id;

  // One foreign audit row makes the audit endpoint's tenant filter observable.
  await sql`INSERT INTO organization_audit_events (organization_id, actor_user_id, event_type, target_type, target_id, metadata) VALUES (${orgB}, ${ownerBId}, 'AREA_CREATED', 'AREA', ${areaB}, ${JSON.stringify({ marker: 'org-b-only' })}::jsonb)`;

  // UXR-F0-M07: OWNER/PLANNER accounts must not start empty — at least one
  // learned FormatProfile, so Fase 3/4 journeys exercise a non-empty format
  // memory state, not just an empty-state screen.
  const orgAFormatProfileLogicalId = (await sql`SELECT gen_random_uuid() as id`)[0].id;
  await sql`
    INSERT INTO format_profiles (
      organization_id, logical_profile_id, version, status, signature, source_type,
      display_name, employee_row_strategy, use_count, successful_use_count, last_used_at, created_by_user_id
    ) VALUES (
      ${orgA}, ${orgAFormatProfileLogicalId}, 1, 'validated',
      ${JSON.stringify({ documentType: 'tabular_csv', structureHash: `e2e-synthetic-fixture-${runId}` })}::jsonb,
      'tabular', ${`E2E Synthetic Roster Format ${runId}`}, 'identifier', 3, 3, NOW(), ${ownerId}
    )
  `;

  mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
  writeFileSync(FIXTURE_PATH, JSON.stringify({
    runId, password: PASSWORD,
    orgA, orgB, orgFresh, approvalShift,
    adminId, empId, multiId, freshId, freshTargetId, unlinkedId, ownerId, adminEmployeeId, plannerId, plannerNoAreaId, plannerGlobalId, inactiveEmployeeUserId, ownerBId, plannerBId, employeeBId, associatedShift,
    empA1, empA2, empAdmin, empInactive, empFresh, empB1, areaA, areaB, importB, shiftB, shiftToday, shiftEnglish, shiftA2,
    orgAName,
    orgBName,
    externalIds: {
      empA1: `E${runId}-001`,
      empA2: `E${runId}-002`,
      empAdmin: `E${runId}-003`,
      empInactive: `E${runId}-004`,
      empB1: `B${runId}-001`,
    },
    emails: {
      admin: email('admin'),
      emp: email('emp'),
      multi: email('multi'),
      fresh: email('fresh'),
      freshTarget: email('fresh-target'),
      unlinked: email('unlinked'),
      owner: email('owner'),
      adminEmployee: email('admin-employee'),
      planner: email('planner'),
      plannerNoArea: email('planner-no-area'),
      plannerGlobal: email('planner-global'),
      inactiveEmployee: email('inactive-employee'),
      ownerB: email('owner-b'),
      plannerB: email('planner-b'),
      employeeB: email('employee-b'),
    },
  }, null, 2));
  console.log('[e2e] fixtures seeded');
}
