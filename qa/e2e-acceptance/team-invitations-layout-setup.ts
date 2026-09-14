import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { hashPassword } from '../../api/_lib/passwords.js';

const fixturePath = join(__dirname, 'artifacts', 'team-invitations-layout-fixture.json');

function readEnvValue(name: string): string {
  const file = readFileSync(join(__dirname, '..', '..', '.env.local'), 'utf8');
  const line = file.split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  const value = line?.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function orgCounts(sql: ReturnType<typeof neon>, organizationId: string) {
  const [memberships, people, employees, profiles, invitations, rolePeriods, scopePeriods, areas, shifts] = await Promise.all([
    sql`SELECT count(*)::int AS count FROM memberships WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM organization_people WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM employees WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM employee_profiles WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM user_access_invitations WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM person_role_periods WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM person_access_scope_periods WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM areas WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM shifts WHERE organization_id = ${organizationId}`,
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
    shifts: shifts[0].count,
  };
}

const EMPLOYEES_SEED = [
  { externalId: 'GFCSV-E001', name: 'Ana Torres Vidal' },
  { externalId: 'GFCSV-E002', name: 'Biel Ferrer Costa' },
  { externalId: 'GFCSV-E003', name: 'Carla Gómez Riera' },
  { externalId: 'GFCSV-E004', name: 'David Pons Llabrés' },
  { externalId: 'GFCSV-E005', name: 'Elena Serra Nadal' },
  { externalId: 'GFCSV-E006', name: 'Francesc Miró Roig' },
  { externalId: 'GFCSV-E007', name: 'Gabriela Cano Puig' },
  { externalId: 'GFCSV-E008', name: 'Hugo Martín Soler' },
  { externalId: 'GFCSV-E009', name: 'Inés Vidal Amengual' },
  { externalId: 'GFCSV-E010', name: 'Joan Oliver Bauzà' },
  { externalId: 'GFCSV-E011', name: 'Laura Ramis Coll' },
  { externalId: 'GFCSV-E012', name: 'Marc Ferragut Bosch' },
];

const INVITATIONS_SEED = [
  { empIndex: 0, role: 'EMPLOYEE' as const, email: 'gf.csv.e001' },
  { empIndex: 1, role: 'PLANNER' as const, email: 'gf.csv.e002' },
  { empIndex: 2, role: 'ADMIN' as const, email: 'gf.csv.e003' },
  { empIndex: 3, role: 'EMPLOYEE' as const, email: 'gf.csv.e004' },
  { empIndex: 4, role: 'PLANNER' as const, email: 'gf.csv.e005' },
  { empIndex: 5, role: 'EMPLOYEE' as const, email: 'gf.csv.e006' },
];

export default async function globalSetup() {
  const databaseUrl = readEnvValue('DATABASE_URL');
  const databaseHost = new URL(databaseUrl).hostname;
  if (!databaseHost.startsWith('ep-lingering-dew-')) {
    throw new Error('Invitations layout E2E is restricted to Neon main (ep-lingering-dew-...)');
  }
  const sql = neon(databaseUrl);

  const targetName = 'groundforce';
  const protectedOrg = (await sql`SELECT id FROM organizations WHERE lower(name) = ${targetName} LIMIT 1`)[0]?.id ?? null;
  if (!protectedOrg) throw new Error('Protected tenant Groundforce not found');
  const protectedCounts = await orgCounts(sql, protectedOrg);

  const runId = Date.now().toString(36);
  const ownerEmail = `owner+layout${runId}@e2e.test`;
  const ownerPassword = 'E2e-layout-pwd-1234';
  const createdOrganizations: string[] = [];
  const createdUsers: string[] = [];

  try {
    const org = (await sql`INSERT INTO organizations (name, type, plan) VALUES (${`E2E Invitations Layout ${runId}`}, 'company', 'team') RETURNING id`)[0];
    createdOrganizations.push(org.id);

    const ownerHash = hashPassword(ownerPassword);
    const owner = (await sql`INSERT INTO users (email, password_hash, display_name) VALUES (${ownerEmail}, ${ownerHash}, 'Owner Layout') RETURNING id`)[0];
    createdUsers.push(owner.id);
    await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${owner.id}, ${org.id}, 'OWNER')`;
    const ownerPerson = (await sql`INSERT INTO organization_people (organization_id, user_id, status) VALUES (${org.id}, ${owner.id}, 'ACTIVE') RETURNING id`)[0];
    await sql`INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, created_by_user_id, source) VALUES (${org.id}, ${ownerPerson.id}, 'OWNER', CURRENT_DATE, ${owner.id}, 'USER')`;

    // 12 employees
    const createdEmployees: { id: string; externalId: string; name: string }[] = [];
    for (const item of EMPLOYEES_SEED) {
      const emp = (await sql`
        INSERT INTO employees (organization_id, name, status, external_employee_id)
        VALUES (${org.id}, ${item.name}, 'active', ${item.externalId})
        RETURNING id
      `)[0];
      createdEmployees.push({ id: emp.id, externalId: item.externalId, name: item.name });
    }

    // 6 pending invitations for first 6 employees
    const createdInvitationIds: string[] = [];
    for (const inv of INVITATIONS_SEED) {
      const emp = createdEmployees[inv.empIndex];
      const personId = randomUUID();
      const invitationId = randomUUID();
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      const email = `${inv.email}+layout${runId}@e2e.test`;

      await sql.transaction((txn) => [
        txn`
          INSERT INTO organization_people (id, organization_id, user_id, status)
          VALUES (${personId}, ${org.id}, NULL, 'PENDING_INVITATION')
        `,
        txn`
          INSERT INTO employee_profiles (id, organization_id, organization_person_id, external_employee_id, employee_name, employment_status)
          VALUES (${emp.id}, ${org.id}, ${personId}, ${emp.externalId}, ${emp.name}, 'ACTIVE')
        `,
        txn`
          INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, created_by_user_id, source)
          VALUES (${org.id}, ${personId}, ${inv.role}, CURRENT_DATE, ${owner.id}, 'USER')
        `,
        txn`
          INSERT INTO user_access_invitations (
            id, organization_id, organization_person_id, email_normalized, invited_by_user_id,
            token_hash, status, created_at, expires_at, last_sent_at, delivery_status, send_attempts
          ) VALUES (
            ${invitationId}, ${org.id}, ${personId}, ${email}, ${owner.id},
            ${tokenHash}, 'PENDING', NOW(), NOW() + interval '7 days', NOW(), 'SENT', 1
          )
        `,
        txn`
          UPDATE employees SET status = 'pending_access'
          WHERE id = ${emp.id}
        `,
      ]);
      createdInvitationIds.push(invitationId);
    }

    mkdirSync(dirname(fixturePath), { recursive: true });
    writeFileSync(fixturePath, JSON.stringify({
      runId,
      organizationId: org.id,
      ownerEmail,
      ownerPassword,
      createdOrganizations,
      createdUsers,
      createdInvitationIds,
      protectedOrg,
      protectedCounts,
    }, null, 2));
  } catch (error) {
    for (const id of createdOrganizations) await sql`DELETE FROM organizations WHERE id = ${id}`;
    for (const id of createdUsers) await sql`DELETE FROM users WHERE id = ${id}`;
    throw error;
  }
}
