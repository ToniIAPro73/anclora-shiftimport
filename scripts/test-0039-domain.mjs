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
    // Cross-table constraint triggers are initially deferred so activation can
    // update entities in any order; force the same commit-time checks here.
    await q('SET CONSTRAINTS ALL IMMEDIATE');
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
    const formerAdmin = id();
    const invitee = id();
    const oauthUser = id();
    const employeePerson = id();
    const pendingPerson = id();
    const adminPerson = id();
    const plannerPerson = id();
    const formerAdminPerson = id();
    const oauthPerson = id();
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
             ($9, $10, $11, $12, 'ACTIVE'), ($13, $14, $15, $16, 'ACTIVE'),
             ($17, $18, $19, $20, 'ACTIVE'), ($21, $22, NULL, $23, 'ACTIVE')`, [
      admin, 'admin-0039@example.com', 'scrypt:test', 'Admin Visible',
      planner, 'planner-0039@example.com', 'scrypt:test', 'Planner Visible',
      employeeUser, 'employee-0039@example.com', 'scrypt:test', 'Sebas',
      formerAdmin, 'former-admin-0039@example.com', 'scrypt:test', 'Former Admin',
      invitee, 'invitee-0039@example.com', 'scrypt:test', 'Invitee',
      oauthUser, 'oauth-0039@example.com', 'OAuth Owner',
    ]);
    await q('INSERT INTO memberships (user_id, organization_id, role, planner_scope_type) VALUES ($1, $2, \'ADMIN\', NULL), ($3, $2, \'PLANNER\', \'ORGANIZATION\'), ($4, $2, \'EMPLOYEE\', NULL), ($5, $2, \'ADMIN\', NULL), ($6, $7, \'OWNER\', NULL)', [
      admin, orgA, planner, employeeUser, formerAdmin, oauthUser, orgB,
    ]);

    // ADMIN/PLANNER identities do not require an employee profile.
    await q(`INSERT INTO organization_people (id, organization_id, user_id, status)
      VALUES ($1, $2, $3, 'ACTIVE'), ($4, $2, $5, 'ACTIVE'), ($6, $2, $7, 'ACTIVE'), ($8, $9, $10, 'ACTIVE')`, [adminPerson, orgA, admin, plannerPerson, planner, formerAdminPerson, formerAdmin, oauthPerson, orgB, oauthUser]);
    await q(`INSERT INTO person_role_periods
      (organization_id, organization_person_id, role, valid_from, valid_to)
      VALUES ($1, $2, 'ADMIN', CURRENT_DATE, NULL),
             ($1, $3, 'PLANNER', CURRENT_DATE, NULL),
             ($1, $4, 'ADMIN', CURRENT_DATE - 10, CURRENT_DATE - 1),
             ($5, $6, 'OWNER', CURRENT_DATE, NULL)`,
      [orgA, adminPerson, plannerPerson, formerAdminPerson, orgB, oauthPerson]);
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

    await expectRejected('pending person without invitation', async () => {
      await q(`INSERT INTO organization_people (id, organization_id, status)
        VALUES ($1, $2, 'PENDING_INVITATION')`, [id(), orgA]);
    });

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
    await expectRejected('pending invitation cannot be deleted while person is pending', async () => {
      await q('DELETE FROM user_access_invitations WHERE token_hash = $1', [tokenA]);
    });
    await expectRejected('cross-organization person reference', async () => {
      await q(`INSERT INTO user_access_invitations
        (organization_id, organization_person_id, email_normalized, invited_by_user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)`, [orgB, pendingPerson, 'cross-0039@example.com', oauthUser, tokenC, expires]);
    });
    await expectRejected('null invitation sender', async () => {
      await q(`INSERT INTO user_access_invitations
        (organization_id, email_normalized, invited_by_user_id, token_hash, expires_at)
        VALUES ($1, $2, NULL, $3, $4)`, [orgA, 'null-sender-0039@example.com', 'f'.repeat(64), expires]);
    });
    await expectRejected('cross-organization invitation sender', async () => {
      await q(`INSERT INTO user_access_invitations
        (organization_id, email_normalized, invited_by_user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4, $5)`, [orgB, 'cross-sender-0039@example.com', admin, '1'.repeat(64), expires]);
    });
    await expectRejected('invitation sender without authorized role', async () => {
      await q(`INSERT INTO user_access_invitations
        (organization_id, email_normalized, invited_by_user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4, $5)`, [orgA, 'employee-sender-0039@example.com', employeeUser, '2'.repeat(64), expires]);
    });
    await expectRejected('invitation sender with ended role', async () => {
      await q(`INSERT INTO user_access_invitations
        (organization_id, email_normalized, invited_by_user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4, $5)`, [orgA, 'former-sender-0039@example.com', formerAdmin, '3'.repeat(64), expires]);
    });
    await q(`INSERT INTO user_access_invitations
      (organization_id, email_normalized, invited_by_user_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4, $5)`, [orgA, 'planner-sender-0039@example.com', planner, '4'.repeat(64), expires]);
    console.log('PASS owner/admin and organization-scoped planner may invite');
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
    await expectRejected('accepted invitation token is immutable', async () => {
      await q(`UPDATE user_access_invitations SET token_hash = $2 WHERE id = $1`, [acceptedId, '5'.repeat(64)]);
    });
    await expectRejected('accepted invitation identity is immutable', async () => {
      await q(`UPDATE user_access_invitations SET email_normalized = $2 WHERE id = $1`, [acceptedId, 'changed-0039@example.com']);
    });
    await expectRejected('accepted invitation timestamp is immutable', async () => {
      await q(`UPDATE user_access_invitations SET accepted_at = NULL WHERE id = $1`, [acceptedId]);
    });

    const expiredId = id();
    await q(`INSERT INTO user_access_invitations
      (id, organization_id, email_normalized, invited_by_user_id, token_hash, status, created_at, expires_at)
      VALUES ($1, $2, $3, $4, $5, 'EXPIRED', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day')`, [expiredId, orgA, 'expired-0039@example.com', admin, 'e'.repeat(64)]);
    const reusable = await q(`SELECT 1 FROM user_access_invitations
      WHERE id = $1 AND status = 'PENDING' AND expires_at > NOW()`, [expiredId]);
    if (reusable.rows.length !== 0) throw new Error('Expired invitation was considered reusable');
    console.log('PASS expired/revoked/accepted invitations are not reusable by state query');

    await expectRejected('expired invitation cannot be marked before expiry', async () => {
      await q(`INSERT INTO user_access_invitations
        (organization_id, email_normalized, invited_by_user_id, token_hash, status, expires_at)
        VALUES ($1, $2, $3, $4, 'EXPIRED', NOW() + INTERVAL '1 day')`, [orgA, 'future-expired-0039@example.com', admin, '6'.repeat(64)]);
    });
    const revokedId = id();
    await q(`INSERT INTO user_access_invitations
      (id, organization_id, email_normalized, invited_by_user_id, token_hash, status, expires_at, revoked_at)
      VALUES ($1, $2, $3, $4, $5, 'REVOKED', NOW() + INTERVAL '1 day', NOW())`, [revokedId, orgA, 'revoked-0039@example.com', admin, '7'.repeat(64)]);
    await expectRejected('revoked invitation cannot return to pending', async () => {
      await q(`UPDATE user_access_invitations SET status = 'PENDING' WHERE id = $1`, [revokedId]);
    });

    // The future acceptance flow can update all cross-table rows in one unit.
    await q(`UPDATE organization_people SET user_id = $2, status = 'ACTIVE' WHERE id = $1`, [pendingPerson, invitee]);
    await q(`INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'EMPLOYEE')`, [invitee, orgA]);
    await q(`UPDATE user_access_invitations SET status = 'ACCEPTED', accepted_at = NOW() WHERE organization_person_id = $1 AND status = 'PENDING'`, [pendingPerson]);
    await q('SET CONSTRAINTS ALL IMMEDIATE');
    console.log('PASS activation links user, person, membership and invitation atomically');

    const rollbackPerson = id();
    const rollbackProfile = id();
    const rollbackInvitation = id();
    await q('SET CONSTRAINTS ALL DEFERRED');
    await q(`INSERT INTO organization_people (id, organization_id, status) VALUES ($1, $2, 'PENDING_INVITATION')`, [rollbackPerson, orgA]);
    await q(`INSERT INTO employee_profiles (id, organization_id, organization_person_id, employee_name, employment_status)
      VALUES ($1, $2, $3, 'Rollback Worker', 'ACTIVE')`, [rollbackProfile, orgA, rollbackPerson]);
    await q(`INSERT INTO user_access_invitations (id, organization_id, organization_person_id, email_normalized, invited_by_user_id, token_hash, expires_at)
      VALUES ($1, $2, $3, 'rollback-0039@example.com', $4, $5, $6)`, [rollbackInvitation, orgA, rollbackPerson, admin, '8'.repeat(64), expires]);
    await q('SAVEPOINT activation_rollback');
    await q(`UPDATE organization_people SET user_id = $2, status = 'ACTIVE' WHERE id = $1`, [rollbackPerson, oauthUser]);
    await expectRejected('incomplete activation rolls back', async () => {
      await q('SET CONSTRAINTS ALL IMMEDIATE');
    });
    await q('ROLLBACK TO SAVEPOINT activation_rollback');
    const rollbackState = await q(`SELECT op.status, op.user_id, i.status AS invitation_status
      FROM organization_people op JOIN user_access_invitations i ON i.organization_person_id=op.id
      WHERE op.id=$1`, [rollbackPerson]);
    if (rollbackState.rows[0].status !== 'PENDING_INVITATION' || rollbackState.rows[0].user_id !== null || rollbackState.rows[0].invitation_status !== 'PENDING') {
      throw new Error('Incomplete activation did not roll back to pending state');
    }
    await q('RELEASE SAVEPOINT activation_rollback');
    console.log('PASS incomplete activation rollback preserves pending state');

    await q(`INSERT INTO user_access_invitations
      (organization_id, email_normalized, invited_by_user_id, token_hash, expires_at)
      VALUES ($1, 'second-org-0039@example.com', $2, $3, $4)`, [orgB, oauthUser, '9'.repeat(64), expires]);
    const globalStatus = await q(`SELECT account_status FROM users WHERE id = $1`, [employeeUser]);
    const orgMemberships = await q(`SELECT count(*)::int AS count FROM memberships WHERE user_id = $1`, [employeeUser]);
    if (globalStatus.rows[0].account_status !== 'ACTIVE' || orgMemberships.rows[0].count !== 1) throw new Error('Second-organization invitation changed global access');
    await q(`UPDATE organization_people SET status = 'SUSPENDED' WHERE id = $1`, [employeePerson]);
    const scopedStatus = await q(`SELECT u.account_status, op.status FROM users u JOIN organization_people op ON op.user_id=u.id WHERE op.id=$1`, [employeePerson]);
    if (scopedStatus.rows[0].account_status !== 'ACTIVE' || scopedStatus.rows[0].status !== 'SUSPENDED') throw new Error('Organization suspension changed global account state');
    console.log('PASS organization access state remains separate from global account status');

    await expectRejected('duplicate user preferences', async () => {
      await q(`INSERT INTO user_preferences (user_id, locale, theme) VALUES ($1, 'es', 'system')`, [admin]);
      await q(`INSERT INTO user_preferences (user_id, locale, theme) VALUES ($1, 'en', 'dark')`, [admin]);
    });
    await q(`INSERT INTO user_preferences (user_id, locale, theme) VALUES ($1, 'en', 'system')`, [planner]);
    await expectRejected('unsupported preference locale', async () => {
      await q(`INSERT INTO user_preferences (user_id, locale, theme) VALUES ($1, 'ca', 'system')`, [employeeUser]);
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
