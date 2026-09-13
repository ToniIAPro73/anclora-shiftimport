import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { hashPassword } from '../../api/_lib/passwords.js';

const fixturePath = join(__dirname, 'artifacts', 'team-access-fixture.json');

function readEnvValue(name: string): string {
  const file = readFileSync(join(__dirname, '..', '..', '.env.local'), 'utf8');
  const line = file.split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  const value = line?.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function orgCounts(sql: ReturnType<typeof neon>, organizationId: string) {
  const [memberships, people, employees, profiles, invitations] = await Promise.all([
    sql`SELECT count(*)::int AS count FROM memberships WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM organization_people WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM employees WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM employee_profiles WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM user_access_invitations WHERE organization_id = ${organizationId}`,
  ]);
  return {
    memberships: memberships[0].count,
    people: people[0].count,
    employees: employees[0].count,
    profiles: profiles[0].count,
    invitations: invitations[0].count,
  };
}

export default async function globalSetup() {
  const databaseUrl = readEnvValue('DATABASE_URL');
  const databaseHost = new URL(databaseUrl).hostname;
  if (!databaseHost.startsWith('ep-lingering-dew-')) {
    throw new Error('Team-access E2E is restricted to Neon main (ep-lingering-dew-...)');
  }
  const sql = neon(databaseUrl);

  const protectedOrg = (await sql`SELECT id FROM organizations WHERE lower(name) = lower('Groundforce') LIMIT 1`)[0]?.id ?? null;
  if (!protectedOrg) throw new Error('Protected tenant Groundforce not found');
  const protectedCounts = await orgCounts(sql, protectedOrg);

  const runSuffix = Date.now().toString(36);
  const ownerEmail = `laura.martin+teamaccess${runSuffix}@e2e.test`;
  const ownerPassword = 'E2e-owner-only-1234';
  const createdOrganizations: string[] = [];
  const createdUsers: string[] = [];

  try {
    const org = (await sql`INSERT INTO organizations (name, type, plan) VALUES (${`Estudio Horizonte TA-${runSuffix}`}, 'company', 'team') RETURNING id`)[0];
    createdOrganizations.push(org.id);

    const ownerHash = hashPassword(ownerPassword);
    const owner = (await sql`INSERT INTO users (email, password_hash, display_name) VALUES (${ownerEmail}, ${ownerHash}, 'Laura Martín') RETURNING id`)[0];
    createdUsers.push(owner.id);
    await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${owner.id}, ${org.id}, 'OWNER')`;
    const ownerPerson = (await sql`INSERT INTO organization_people (organization_id, user_id, status) VALUES (${org.id}, ${owner.id}, 'ACTIVE') RETURNING id`)[0];
    await sql`INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, created_by_user_id, source) VALUES (${org.id}, ${ownerPerson.id}, 'OWNER', CURRENT_DATE, ${owner.id}, 'USER')`;

    const area = (await sql`INSERT INTO areas (organization_id, name, code, active) VALUES (${org.id}, 'Operaciones', 'OPS', TRUE) RETURNING id`)[0];

    // A SEPARATE organization for the visual-states screenshot spec — kept
    // apart from the cycle-test org so that org's row counts (asserted
    // precisely, e.g. "exactly 1 person") are never polluted by these extra
    // synthetic people. Seeded directly via SQL (no API call, no email): one
    // already-active person (to screenshot the revoke dialog) and one
    // already-revoked person (to screenshot the grant-access modal with its
    // email prefilled) — the visual spec never submits either modal.
    const visualOrg = (await sql`INSERT INTO organizations (name, type, plan) VALUES (${`Estudio Horizonte TA-Visual-${runSuffix}`}, 'company', 'team') RETURNING id`)[0];
    createdOrganizations.push(visualOrg.id);
    const visualOwnerEmail = `laura.martin+teamaccessvisual${runSuffix}@e2e.test`;
    const visualOwnerHash = hashPassword(ownerPassword);
    const visualOwner = (await sql`INSERT INTO users (email, password_hash, display_name) VALUES (${visualOwnerEmail}, ${visualOwnerHash}, 'Laura Martín') RETURNING id`)[0];
    createdUsers.push(visualOwner.id);
    await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${visualOwner.id}, ${visualOrg.id}, 'OWNER')`;
    const visualOwnerPerson = (await sql`INSERT INTO organization_people (organization_id, user_id, status) VALUES (${visualOrg.id}, ${visualOwner.id}, 'ACTIVE') RETURNING id`)[0];
    await sql`INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, created_by_user_id, source) VALUES (${visualOrg.id}, ${visualOwnerPerson.id}, 'OWNER', CURRENT_DATE, ${visualOwner.id}, 'USER')`;

    const activeEmail = `persona.ta-active-${runSuffix}@e2e.test`;
    const activeHash = hashPassword('E2e-new-only-1234');
    const activeUser = (await sql`INSERT INTO users (email, password_hash, display_name, account_status) VALUES (${activeEmail}, ${activeHash}, 'Nora Activa', 'ACTIVE') RETURNING id`)[0];
    createdUsers.push(activeUser.id);
    const activeEmployee = (await sql`INSERT INTO employees (organization_id, name, status, user_id) VALUES (${visualOrg.id}, 'Nora Activa', 'active', ${activeUser.id}) RETURNING id`)[0];
    const activeOrgPerson = (await sql`INSERT INTO organization_people (organization_id, user_id, status) VALUES (${visualOrg.id}, ${activeUser.id}, 'ACTIVE') RETURNING id`)[0];
    await sql`INSERT INTO employee_profiles (id, organization_id, organization_person_id, employee_name, employment_status) VALUES (${activeEmployee.id}, ${visualOrg.id}, ${activeOrgPerson.id}, 'Nora Activa', 'ACTIVE')`;
    await sql`INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, created_by_user_id, source) VALUES (${visualOrg.id}, ${activeOrgPerson.id}, 'EMPLOYEE', CURRENT_DATE, ${visualOwner.id}, 'USER')`;
    await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${activeUser.id}, ${visualOrg.id}, 'EMPLOYEE')`;

    const revokedEmail = `persona.ta-revoked-${runSuffix}@e2e.test`;
    const revokedHash = hashPassword('E2e-new-only-1234');
    const revokedUser = (await sql`INSERT INTO users (email, password_hash, display_name, account_status) VALUES (${revokedEmail}, ${revokedHash}, 'Marc Revocado', 'ACTIVE') RETURNING id`)[0];
    createdUsers.push(revokedUser.id);
    const revokedEmployee = (await sql`INSERT INTO employees (organization_id, name, status, user_id) VALUES (${visualOrg.id}, 'Marc Revocado', 'active', NULL) RETURNING id`)[0];
    const revokedOrgPerson = (await sql`INSERT INTO organization_people (organization_id, user_id, status) VALUES (${visualOrg.id}, ${revokedUser.id}, 'ACTIVE') RETURNING id`)[0];
    await sql`INSERT INTO employee_profiles (id, organization_id, organization_person_id, employee_name, employment_status) VALUES (${revokedEmployee.id}, ${visualOrg.id}, ${revokedOrgPerson.id}, 'Marc Revocado', 'ACTIVE')`;
    await sql`INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, created_by_user_id, source) VALUES (${visualOrg.id}, ${revokedOrgPerson.id}, 'EMPLOYEE', CURRENT_DATE, ${visualOwner.id}, 'USER')`;
    // Deliberately no memberships row — this person's access is already revoked.

    mkdirSync(dirname(fixturePath), { recursive: true });
    writeFileSync(fixturePath, JSON.stringify({
      runSuffix,
      organizationId: org.id,
      ownerEmail,
      ownerPassword,
      areaId: area.id,
      areaName: 'Operaciones',
      visualOwnerEmail,
      visualOwnerPassword: ownerPassword,
      screenshotActive: { userId: activeUser.id, name: 'Nora Activa', email: activeEmail },
      screenshotRevoked: { employeeId: revokedEmployee.id, name: 'Marc Revocado', email: revokedEmail },
      createdOrganizations,
      createdUsers,
      // Emails the cycle test will create along the way — teardown deletes
      // any user with these addresses even if a step fails partway through.
      createdRecipientEmails: [`persona.taccess${runSuffix}@e2e.test`],
      protectedOrg,
      protectedCounts,
    }, null, 2));
  } catch (error) {
    for (const id of createdOrganizations) await sql`DELETE FROM organizations WHERE id = ${id}`;
    for (const id of createdUsers) await sql`DELETE FROM users WHERE id = ${id}`;
    throw error;
  }
}
