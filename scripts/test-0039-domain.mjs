/**
 * Exercises the materialized 0039 domain with synthetic data only.
 * DATABASE_URL must point at an accredited, non-main ephemeral branch.
 */
import { Client } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required and must point to an accredited ephemeral branch.');
}

const client = new Client(process.env.DATABASE_URL);
const q = (text, params = []) => client.query(text, params);
const id = () => randomUUID();

async function expectRejected(label, operation) {
  await q('SAVEPOINT migration_0039_case');
  let rejected = false;
  try {
    await operation();
  } catch {
    rejected = true;
  }
  await q('ROLLBACK TO SAVEPOINT migration_0039_case');
  await q('RELEASE SAVEPOINT migration_0039_case');
  if (!rejected) throw new Error(`Expected rejection: ${label}`);
  console.log(`PASS ${label}`);
}

async function run() {
  await client.connect();
  await q('BEGIN');
  try {
    const orgA = id();
    const orgB = id();
    const admin = id();
    const planner = id();
    const employeeUser = id();
    const oauthUser = id();
    const employeePerson = id();
    const pendingPerson = id();
    const adminPerson = id();
    const plannerPerson = id();
    const employeeProfile = id();
    const pendingProfile = id();
    const tokenA = 'a'.repeat(64);
    const tokenB = 'b'.repeat(64);
    const tokenC = 'c'.repeat(64);
    const expires = new Date(Date.now() + 86_400_000).toISOString();

    await q('INSERT INTO organizations (id, name, type) VALUES ($1, $2, $3), ($4, $5, $6)', [
      orgA, 'Synthetic Org A', 'company', orgB, 'Synthetic Org B', 'company',
    ]);
    await q(`INSERT INTO users (id, email, password_hash, display_name, account_status)
      VALUES ($1, $2, $3, $4, 'ACTIVE'), ($5, $6, $7, $8, 'ACTIVE'),
             ($9, $10, $11, $12, 'ACTIVE'), ($13, $14, NULL, $15, 'ACTIVE')`, [
      admin, 'admin-0039@example.com', 'scrypt:test', 'Admin Visible',
      planner, 'planner-0039@example.com', 'scrypt:test', 'Planner Visible',
      employeeUser, 'employee-0039@example.com', 'scrypt:test', 'Sebas',
      oauthUser, 'oauth-0039@example.com', 'OAuth Owner',
    ]);
    await q('INSERT INTO memberships (user_id, organization_id, role, planner_scope_type) VALUES ($1, $2, \'ADMIN\', NULL), ($3, $2, \'PLANNER\', \'ORGANIZATION\'), ($4, $5, \'OWNER\', NULL)', [
      admin, orgA, planner, oauthUser, orgB,
    ]);

    // ADMIN/PLANNER identities do not require an employee profile.
    await q(`INSERT INTO organization_people (id, organization_id, user_id, status)
      VALUES ($1, $2, $3, 'ACTIVE'), ($4, $2, $5, 'ACTIVE')`, [adminPerson, orgA, admin, plannerPerson, planner]);
    console.log('PASS admin/planner without employee profile permitted');

    // User and employee names are independent fields.
    await q(`INSERT INTO organization_people (id, organization_id, user_id, status)
      VALUES ($1, $2, $3, 'ACTIVE')`, [employeePerson, orgA, employeeUser]);
    await q(`INSERT INTO employee_profiles (id, organization_id, organization_person_id, employee_name, employment_status)
      VALUES ($1, $2, $3, $4, 'ACTIVE')`, [employeeProfile, orgA, employeePerson, 'Sebastián Pozo Mendoza']);
    console.log('PASS user and employee names are independent');

    // A pending employee can be staged without an activated account.
    await q(`INSERT INTO organization_people (id, organization_id, status)
      VALUES ($1, $2, 'PENDING_INVITATION')`, [pendingPerson, orgA]);
    await q(`INSERT INTO employee_profiles (id, organization_id, organization_person_id, employee_name, employment_status)
      VALUES ($1, $2, $3, $4, 'ACTIVE')`, [pendingProfile, orgA, pendingPerson, 'Pending Worker']);
    await q(`INSERT INTO user_access_invitations
      (organization_id, organization_person_id, email_normalized, invited_by_user_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)`, [orgA, pendingPerson, 'pending-0039@example.com', admin, tokenA, expires]);
    console.log('PASS pending employee with invitation permitted');

    await expectRejected('active employee without user', async () => {
      const person = id();
      await q(`INSERT INTO organization_people (id, organization_id, status) VALUES ($1, $2, 'ACTIVE')`, [person, orgA]);
      await q(`INSERT INTO employee_profiles (organization_id, organization_person_id, employee_name, employment_status)
        VALUES ($1, $2, 'Invalid Active Worker', 'ACTIVE')`, [orgA, person]);
    });

    // Same email is legal in two organizations.
    await q(`INSERT INTO user_access_invitations
      (organization_id, email_normalized, invited_by_user_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4, $5)`, [orgB, 'pending-0039@example.com', oauthUser, tokenB, expires]);
    console.log('PASS same email across organizations permitted');

    await expectRejected('duplicate pending organization/email', async () => {
      await q(`INSERT INTO user_access_invitations
        (organization_id, email_normalized, invited_by_user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4, $5)`, [orgA, 'pending-0039@example.com', admin, tokenC, expires]);
    });
    await expectRejected('duplicate pending organization/person', async () => {
      await q(`INSERT INTO user_access_invitations
        (organization_id, organization_person_id, email_normalized, invited_by_user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)`, [orgA, pendingPerson, 'different-0039@example.com', admin, tokenC, expires]);
    });
    await expectRejected('cross-organization person reference', async () => {
      await q(`INSERT INTO user_access_invitations
        (organization_id, organization_person_id, email_normalized, invited_by_user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)`, [orgB, pendingPerson, 'cross-0039@example.com', oauthUser, tokenC, expires]);
    });
    await expectRejected('duplicate token hash', async () => {
      await q(`INSERT INTO user_access_invitations
        (organization_id, email_normalized, invited_by_user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4, $5)`, [orgB, 'another-0039@example.com', oauthUser, tokenA, expires]);
    });

    const acceptedId = id();
    await q(`INSERT INTO user_access_invitations
      (id, organization_id, email_normalized, invited_by_user_id, token_hash, status, expires_at, accepted_at)
      VALUES ($1, $2, $3, $4, $5, 'ACCEPTED', $6, NOW())`, [acceptedId, orgA, 'accepted-0039@example.com', admin, 'd'.repeat(64), expires]);
    await expectRejected('accepted invitation cannot return to pending', async () => {
      await q(`UPDATE user_access_invitations SET status = 'PENDING' WHERE id = $1`, [acceptedId]);
    });

    const expiredId = id();
    await q(`INSERT INTO user_access_invitations
      (id, organization_id, email_normalized, invited_by_user_id, token_hash, status, expires_at)
      VALUES ($1, $2, $3, $4, $5, 'EXPIRED', NOW() + INTERVAL '1 day')`, [expiredId, orgA, 'expired-0039@example.com', admin, 'e'.repeat(64)]);
    const reusable = await q(`SELECT 1 FROM user_access_invitations
      WHERE id = $1 AND status = 'PENDING' AND expires_at > NOW()`, [expiredId]);
    if (reusable.rows.length !== 0) throw new Error('Expired invitation was considered reusable');
    console.log('PASS expired/revoked/accepted invitations are not reusable by state query');

    await expectRejected('duplicate user preferences', async () => {
      await q(`INSERT INTO user_preferences (user_id, locale, theme) VALUES ($1, 'es', 'SYSTEM')`, [admin]);
      await q(`INSERT INTO user_preferences (user_id, locale, theme) VALUES ($1, 'en', 'DARK')`, [admin]);
    });
    await q(`INSERT INTO user_preferences (user_id, locale, theme) VALUES ($1, 'en', 'SYSTEM')`, [planner]);
    await expectRejected('unsupported preference locale', async () => {
      await q(`INSERT INTO user_preferences (user_id, locale, theme) VALUES ($1, 'ca', 'SYSTEM')`, [employeeUser]);
    });
    await expectRejected('unsupported preference theme', async () => {
      await q(`INSERT INTO user_preferences (user_id, locale, theme) VALUES ($1, 'es', 'BLUE')`, [employeeUser]);
    });

    const oauth = await q(`SELECT password_hash, account_status FROM users WHERE id = $1`, [oauthUser]);
    if (oauth.rows[0].password_hash !== null || oauth.rows[0].account_status !== 'ACTIVE') {
      throw new Error('OAuth-only active account was not preserved');
    }
    console.log('PASS active OAuth-only owner remains passwordless and active');
  } finally {
    await q('ROLLBACK');
    await client.end();
  }
}

run().catch((error) => {
  console.error(`[test] 0039 domain failure: ${error.message}`);
  process.exitCode = 1;
});
