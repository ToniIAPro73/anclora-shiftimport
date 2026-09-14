import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { hashPassword } from '../../api/_lib/passwords.js';

const fixturePath = join(__dirname, 'artifacts', 'csv-bulk-production-fixture.json');

function readEnvValue(name: string): string {
  const file = readFileSync(join(__dirname, '..', '..', '.env.local'), 'utf8');
  const line = file.split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  const value = line?.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function orgCounts(sql: ReturnType<typeof neon>, organizationId: string) {
  const [memberships, people, employees, profiles, invitations, rolePeriods, scopePeriods, areas] = await Promise.all([
    sql`SELECT count(*)::int AS count FROM memberships WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM organization_people WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM employees WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM employee_profiles WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM user_access_invitations WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM person_role_periods WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM person_access_scope_periods WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM areas WHERE organization_id = ${organizationId}`,
  ]);
  return {
    memberships: memberships[0].count,
    people: people[0].count,
    employees: employees[0].count,
    profiles: profiles[0].count,
    invitations: invitations[0].count,
    rolePeriods: rolePeriods[0].count,
    scopePeriods: scopePeriods[0].count,
    areas: areas[0].count,
  };
}

export default async function globalSetup() {
  const databaseUrl = readEnvValue('DATABASE_URL');
  const databaseHost = new URL(databaseUrl).hostname;
  if (!databaseHost.startsWith('ep-lingering-dew-')) {
    throw new Error('CSV bulk-import E2E is restricted to Neon main (ep-lingering-dew-...)');
  }
  const sql = neon(databaseUrl);

  const protectedOrg = (await sql`SELECT id FROM organizations WHERE lower(name) = lower('Groundforce') LIMIT 1`)[0]?.id ?? null;
  if (!protectedOrg) throw new Error('Protected tenant Groundforce not found');
  const protectedCounts = await orgCounts(sql, protectedOrg);

  const runId = Date.now().toString(36);
  const ownerEmail = `laura.martin+csvbulk${runId}@e2e.test`;
  const ownerPassword = 'E2e-owner-only-1234';
  const nonAdminEmail = `carla.norole+csvbulk${runId}@e2e.test`;
  const nonAdminPassword = 'E2e-nonadmin-only-1234';
  const createdOrganizations: string[] = [];
  const createdUsers: string[] = [];

  try {
    const org = (await sql`INSERT INTO organizations (name, type, plan) VALUES (${`E2E CSV Management ${runId}`}, 'company', 'team') RETURNING id`)[0];
    createdOrganizations.push(org.id);

    const ownerHash = hashPassword(ownerPassword);
    const owner = (await sql`INSERT INTO users (email, password_hash, display_name) VALUES (${ownerEmail}, ${ownerHash}, 'Laura Martín') RETURNING id`)[0];
    createdUsers.push(owner.id);
    await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${owner.id}, ${org.id}, 'OWNER')`;
    const ownerPerson = (await sql`INSERT INTO organization_people (organization_id, user_id, status) VALUES (${org.id}, ${owner.id}, 'ACTIVE') RETURNING id`)[0];
    await sql`INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, created_by_user_id, source) VALUES (${org.id}, ${ownerPerson.id}, 'OWNER', CURRENT_DATE, ${owner.id}, 'USER')`;

    // A non-admin member (EMPLOYEE) — used to prove the backend rejects
    // CSV bulk-import calls regardless of what the UI would show/hide.
    const nonAdminHash = hashPassword(nonAdminPassword);
    const nonAdmin = (await sql`INSERT INTO users (email, password_hash, display_name) VALUES (${nonAdminEmail}, ${nonAdminHash}, 'Carla Sin Rol') RETURNING id`)[0];
    createdUsers.push(nonAdmin.id);
    await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${nonAdmin.id}, ${org.id}, 'EMPLOYEE')`;
    const nonAdminPerson = (await sql`INSERT INTO organization_people (organization_id, user_id, status) VALUES (${org.id}, ${nonAdmin.id}, 'ACTIVE') RETURNING id`)[0];
    await sql`INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, created_by_user_id, source) VALUES (${org.id}, ${nonAdminPerson.id}, 'EMPLOYEE', CURRENT_DATE, ${owner.id}, 'USER')`;

    const area = (await sql`INSERT INTO areas (organization_id, name, code, active) VALUES (${org.id}, 'Operaciones', 'OPS', TRUE) RETURNING id`)[0];

    // A pre-existing GLOBAL account (never a member of THIS org) — used by
    // the users-CSV scenario to prove "cuenta global existente" links via
    // the safe invitation flow instead of creating a duplicate user.
    const existingAccountEmail = `existing.account+csvbulk${runId}@e2e.test`;
    const existingAccountHash = hashPassword('E2e-existing-only-1234');
    const existingAccount = (await sql`INSERT INTO users (email, password_hash, display_name, account_status) VALUES (${existingAccountEmail}, ${existingAccountHash}, 'Existing Account', 'ACTIVE') RETURNING id`)[0];
    createdUsers.push(existingAccount.id);

    // An employee already linked to a DIFFERENT user — used to prove the
    // users-CSV cannot silently re-link an already-associated employee.
    const linkedUserEmail = `linked.user+csvbulk${runId}@e2e.test`;
    const linkedUserHash = hashPassword('E2e-linked-only-1234');
    const linkedUser = (await sql`INSERT INTO users (email, password_hash, display_name, account_status) VALUES (${linkedUserEmail}, ${linkedUserHash}, 'Linked User', 'ACTIVE') RETURNING id`)[0];
    createdUsers.push(linkedUser.id);
    const linkedEmployee = (await sql`INSERT INTO employees (organization_id, name, status, external_employee_id, user_id) VALUES (${org.id}, 'Ya Vinculado', 'active', ${`E2E-LINKED-${runId}`}, ${linkedUser.id}) RETURNING id`)[0];
    const linkedPerson = (await sql`INSERT INTO organization_people (organization_id, user_id, status) VALUES (${org.id}, ${linkedUser.id}, 'ACTIVE') RETURNING id`)[0];
    await sql`INSERT INTO employee_profiles (id, organization_id, organization_person_id, employee_name, employment_status) VALUES (${linkedEmployee.id}, ${org.id}, ${linkedPerson.id}, 'Ya Vinculado', 'ACTIVE')`;
    await sql`INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, created_by_user_id, source) VALUES (${org.id}, ${linkedPerson.id}, 'EMPLOYEE', CURRENT_DATE, ${owner.id}, 'USER')`;
    await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${linkedUser.id}, ${org.id}, 'EMPLOYEE')`;

    // An existing employee (create/update/no-change baseline for the
    // employees-CSV mixed scenario) — unlinked, matched by external id.
    const existingEmployeeExtId = `E2E-EXIST-${runId}`;
    const existingEmployee = (await sql`INSERT INTO employees (organization_id, name, status, external_employee_id) VALUES (${org.id}, 'Elena Vieja', 'active', ${existingEmployeeExtId}) RETURNING id`)[0];

    mkdirSync(dirname(fixturePath), { recursive: true });
    writeFileSync(fixturePath, JSON.stringify({
      runId,
      organizationId: org.id,
      ownerEmail,
      ownerPassword,
      nonAdminEmail,
      nonAdminPassword,
      areaId: area.id,
      areaName: 'Operaciones',
      existingAccountEmail,
      linkedEmployeeExternalId: `E2E-LINKED-${runId}`,
      existingEmployeeExternalId: existingEmployeeExtId,
      existingEmployeeId: existingEmployee.id,
      createdOrganizations,
      createdUsers,
      // Emails the import scenarios will create along the way — teardown
      // deletes any user with these addresses even if a step fails partway.
      createdRecipientEmails: [
        `nueva.persona+csvbulk${runId}@e2e.test`,
        `otra.persona+csvbulk${runId}@e2e.test`,
      ],
      protectedOrg,
      protectedCounts,
    }, null, 2));
  } catch (error) {
    for (const id of createdOrganizations) await sql`DELETE FROM organizations WHERE id = ${id}`;
    for (const id of createdUsers) await sql`DELETE FROM users WHERE id = ${id}`;
    throw error;
  }
}
