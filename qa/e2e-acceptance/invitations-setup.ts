import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { hashPassword } from '../../api/_lib/passwords.js';

const fixturePath = join(__dirname, 'artifacts', 'invitations-fixture.json');
const root = join(__dirname, '..');

// Each viewport project runs the same specs sequentially against the shared
// production DB; invitation tokens are single-use, so every project needs its own
// create/link pair or the 2nd and 3rd projects see a 404 on an already-
// consumed token from the 1st.
const PROJECT_LABELS = ['desktop-1440x900', 'desktop-1366x768', 'tablet-1024x768', 'mobile-390x844', 'mobile-360x800'];

function readEnvValue(name: string): string {
  const file = readFileSync(join(root, '..', '.env.local'), 'utf8');
  const line = file.split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  const value = line?.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function orgCounts(sql: ReturnType<typeof neon>, organizationId: string) {
  const [memberships, people, employees, profiles, rolePeriods, scopePeriods, invitations] = await Promise.all([
    sql`SELECT count(*)::int AS count FROM memberships WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM organization_people WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM employees WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM employee_profiles WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM person_role_periods WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM person_access_scope_periods WHERE organization_id = ${organizationId}`,
    sql`SELECT count(*)::int AS count FROM user_access_invitations WHERE organization_id = ${organizationId}`,
  ]);
  return {
    memberships: memberships[0].count,
    people: people[0].count,
    employees: employees[0].count,
    profiles: profiles[0].count,
    rolePeriods: rolePeriods[0].count,
    scopePeriods: scopePeriods[0].count,
    invitations: invitations[0].count,
  };
}

async function createOwner(sql: ReturnType<typeof neon>, organizationId: string, email: string, displayName = 'Laura Martín') {
  const passwordHash = hashPassword('E2e-owner-only-1234');
  const user = (await sql`INSERT INTO users (email, password_hash, display_name) VALUES (${email}, ${passwordHash}, ${displayName}) RETURNING id`)[0];
  await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${user.id}, ${organizationId}, 'OWNER')`;
  const person = (await sql`INSERT INTO organization_people (organization_id, user_id, status) VALUES (${organizationId}, ${user.id}, 'ACTIVE') RETURNING id`)[0];
  await sql`INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, created_by_user_id, source) VALUES (${organizationId}, ${person.id}, 'OWNER', CURRENT_DATE, ${user.id}, 'USER')`;
  return { userId: user.id, personId: person.id };
}

async function seedInvitation(sql: ReturnType<typeof neon>, organizationId: string, ownerId: string, email: string, status = 'PENDING', expiresAt = '2099-12-31T00:00:00.000Z') {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const personId = randomUUID();
  await sql.transaction((txn) => [
    txn`INSERT INTO organization_people (id, organization_id, user_id, status) VALUES (${personId}, ${organizationId}, NULL, ${status === 'PENDING' ? 'PENDING_INVITATION' : 'ACTIVE'})`,
    txn`INSERT INTO user_access_invitations (organization_id, organization_person_id, email_normalized, invited_by_user_id, token_hash, status, created_at, expires_at, delivery_status) VALUES (${organizationId}, ${personId}, ${email}, ${ownerId}, ${tokenHash}, ${status}, NOW(), ${expiresAt}, 'SENT')`,
  ]);
  return { token, invitationPersonId: personId };
}

export default async function globalSetup() {
  const databaseUrl = readEnvValue('DATABASE_URL');
  const databaseHost = new URL(databaseUrl).hostname;
  if (!databaseHost.startsWith('ep-lingering-dew-')) {
    throw new Error('Invitation E2E is restricted to Neon main (ep-lingering-dew-...)');
  }
  const sql = neon(databaseUrl);
  const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${randomUUID()}`;
  const priorName = 'Estudio Horizonte';
  const protectedOrg = (await sql`SELECT id FROM organizations WHERE lower(name) = lower('Groundforce') LIMIT 1`)[0]?.id ?? null;
  if (!protectedOrg) throw new Error('Protected tenant Groundforce not found');
  const protectedCounts = await orgCounts(sql, protectedOrg);
  const createdOrganizations: string[] = [];
  const createdUsers: string[] = [];

  try {
    const createOrg = async (name: string) => {
      const row = (await sql`INSERT INTO organizations (name, type, plan) VALUES (${name}, 'company', 'team') RETURNING id`)[0];
      createdOrganizations.push(row.id);
      return row.id;
    };

    const priorOrgId = await createOrg(priorName);
    const priorOwnerUser = await createOwner(sql, priorOrgId, 'laura.martin+prior@e2e.test');
    createdUsers.push(priorOwnerUser.userId);

    const existingEmail = 'toni.garcia@e2e.test';
    const existingPasswordHash = hashPassword('E2e-existing-only-1234');
    const existingUser = (await sql`INSERT INTO users (email, password_hash, display_name) VALUES (${existingEmail}, ${existingPasswordHash}, 'Toni García') RETURNING id`)[0];
    createdUsers.push(existingUser.id);
    await sql`INSERT INTO memberships (user_id, organization_id, role) VALUES (${existingUser.id}, ${priorOrgId}, 'EMPLOYEE')`;
    const existingPriorPerson = (await sql`INSERT INTO organization_people (organization_id, user_id, status) VALUES (${priorOrgId}, ${existingUser.id}, 'ACTIVE') RETURNING id`)[0];
    await sql`INSERT INTO person_role_periods (organization_id, organization_person_id, role, valid_from, created_by_user_id, source) VALUES (${priorOrgId}, ${existingPriorPerson.id}, 'EMPLOYEE', CURRENT_DATE, ${priorOwnerUser.userId}, 'USER')`;

    const tokensByProject: Record<string, { createToken: string; linkToken: string; visualTokens: Record<string, string> }> = {};
    const invitedEmails: string[] = [existingEmail];
    // The responsive/visual spec runs once per (project, theme) and each run
    // completes a real accept flow to reach 'success' — every theme needs
    // its own token, or the 2nd theme finds the invitation already ACCEPTED.
    const VISUAL_THEMES = ['dark', 'light'];
    for (const [projectIndex, label] of PROJECT_LABELS.entries()) {
      const createOrgId = await createOrg('Estudio Horizonte');
      const linkOrgId = await createOrg('Estudio Horizonte');
      const createOwnerUser = await createOwner(sql, createOrgId, `laura.martin+create${projectIndex + 1}@e2e.test`);
      const linkOwnerUser = await createOwner(sql, linkOrgId, `laura.martin+link${projectIndex + 1}@e2e.test`);
      createdUsers.push(createOwnerUser.userId, linkOwnerUser.userId);

      const createEmail = `toni.garcia+new${projectIndex + 1}@e2e.test`;
      invitedEmails.push(createEmail, existingEmail);
      const createInvite = await seedInvitation(sql, createOrgId, createOwnerUser.userId, createEmail);
      const linkInvite = await seedInvitation(sql, linkOrgId, linkOwnerUser.userId, existingEmail);

      const visualTokens: Record<string, string> = {};
      for (const themeLabel of VISUAL_THEMES) {
        // Dedicated org+token per (project, theme) for the responsive spec's
        // success-state check — it must never share one with the functional
        // flow tests in invitations.spec.ts, nor across themes.
        const visualOrgId = await createOrg('Estudio Horizonte');
        const visualOwnerUser = await createOwner(sql, visualOrgId, `laura.martin+visual${projectIndex + 1}${themeLabel}@e2e.test`);
        createdUsers.push(visualOwnerUser.userId);
        const visualEmail = `toni.garcia+visual${projectIndex + 1}${themeLabel}@e2e.test`;
        invitedEmails.push(visualEmail);
        const visualInvite = await seedInvitation(sql, visualOrgId, visualOwnerUser.userId, visualEmail);
        visualTokens[themeLabel] = visualInvite.token;
      }

      tokensByProject[label] = { createToken: createInvite.token, linkToken: linkInvite.token, visualTokens };
    }

    // Guardrail (item 4): this suite must never create, seed or later
    // consume an invitation for a real recipient — only synthetic
    // @e2e.test addresses are ever used here.
    if (invitedEmails.some((email) => !email.endsWith('@e2e.test'))) {
      throw new Error('Refusing to seed an invitation for a non-synthetic recipient email');
    }

    mkdirSync(dirname(fixturePath), { recursive: true });
    writeFileSync(fixturePath, JSON.stringify({
      runId,
      createdOrganizations,
      createdUsers,
      tokensByProject,
      existingUserId: existingUser.id,
      existingPasswordHash,
      existingEmail,
      protectedOrg,
      protectedCounts,
    }, null, 2));
  } catch (error) {
    for (const id of createdOrganizations) await sql`DELETE FROM organizations WHERE id = ${id}`;
    for (const id of createdUsers) await sql`DELETE FROM users WHERE id = ${id}`;
    throw error;
  }
}
