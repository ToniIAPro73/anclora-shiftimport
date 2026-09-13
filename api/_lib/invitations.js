import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { can, ACTIONS } from './authorization.js';
import { HttpError, requireRole } from './auth.js';
import { requireFeature } from './plans.js';
import { hashPassword } from './passwords.js';
import { createEmailTransport } from './email/transport.js';
import { buildInvitationEmail } from './email/invitations.js';

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const TOKEN_BYTES = 32;
const DEFAULT_EXPIRY_DAYS = 7;
const INVITATION_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export function requireInvitationLocale(value) {
  if (value !== 'es' && value !== 'en') {
    const error = new HttpError(400, 'The application locale is required to generate an invitation');
    error.code = 'INVITATION_LOCALE_REQUIRED';
    throw error;
  }
  return value;
}
const INVITATION_ROLES = new Set(['ADMIN', 'PLANNER', 'EMPLOYEE']);

export function normalizeInvitationEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 320) {
    const error = new HttpError(400, 'A valid email is required');
    error.code = 'INVALID_EMAIL';
    throw error;
  }
  return email;
}

export function createInvitationToken() {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: createHash('sha256').update(token).digest('hex') };
}

export function isValidInvitationToken(token) {
  return typeof token === 'string' && INVITATION_TOKEN_RE.test(token);
}

export function invitationPublicState(row, now = new Date()) {
  if (!row || row.status !== 'PENDING') return 'INVALID';
  if (new Date(row.expires_at).getTime() <= now.getTime()) return 'EXPIRED';
  return 'VALID';
}

function invitationRole(value) {
  const role = String(value ?? '').trim().toUpperCase();
  if (!INVITATION_ROLES.has(role)) {
    throw new HttpError(400, 'This role cannot be invited');
  }
  return role;
}

function safeInvitation(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationPersonId: row.organization_person_id ?? null,
    email: row.email_normalized,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at ?? null,
    revokedAt: row.revoked_at ?? null,
    lastSentAt: row.last_sent_at ?? null,
    lastDeliveryAt: row.last_delivery_at ?? null,
    deliveryStatus: row.delivery_status,
    sendAttempts: row.send_attempts,
  };
}

function assertInvitationActor(ctx) {
  requireRole(ctx, 'ADMIN');
  if (!can({ userId: ctx.user.id, role: ctx.role }, ACTIONS.MANAGE_USERS, {})) {
    throw new HttpError(403, 'You cannot manage organization access');
  }
}

async function assertCurrentInvitationActor(sql, ctx, organizationId) {
  const rows = await sql`
    SELECT 1
    FROM users u
    JOIN memberships m ON m.user_id = u.id AND m.organization_id = ${organizationId}
    JOIN organization_people op ON op.user_id = m.user_id
      AND op.organization_id = m.organization_id AND op.status = 'ACTIVE'
    JOIN person_role_periods prp ON prp.organization_person_id = op.id
      AND prp.organization_id = op.organization_id AND prp.role = m.role
      AND prp.valid_from <= CURRENT_DATE
      AND (prp.valid_to IS NULL OR prp.valid_to >= CURRENT_DATE)
    WHERE u.id = ${ctx.user.id}
      AND u.account_status = 'ACTIVE'
      AND m.role IN ('OWNER', 'ADMIN')
  `;
  if (rows.length === 0) {
    throw new HttpError(403, 'The invitation sender is not authorized in this organization');
  }
}

async function resolveEmployeePerson(sql, organizationId, employeeId) {
  const employeeRows = await sql`
    SELECT e.id, e.organization_id, e.user_id, e.status, e.name, e.external_employee_id,
           op.id AS organization_person_id, op.status AS person_status, op.user_id AS person_user_id,
           ep.id AS employee_profile_id
    FROM employees e
    LEFT JOIN employee_profiles ep ON ep.id = e.id AND ep.organization_id = e.organization_id
    LEFT JOIN organization_people op ON op.id = ep.organization_person_id AND op.organization_id = ep.organization_id
    WHERE e.id = ${employeeId} AND e.organization_id = ${organizationId}
  `;
  if (employeeRows.length === 0) {
    const error = new HttpError(404, 'Employee not found');
    error.code = 'EMPLOYEE_NOT_FOUND';
    throw error;
  }
  const row = employeeRows[0];
  if (row.user_id || row.person_user_id) {
    const error = new HttpError(409, 'This employee already has active access');
    error.code = 'EMPLOYEE_ALREADY_LINKED';
    throw error;
  }
  if (row.status === 'inactive') {
    throw new HttpError(409, 'Inactive employees cannot receive access');
  }
  return {
    employeeId: row.id,
    personId: row.organization_person_id ?? row.id,
    personExists: Boolean(row.organization_person_id),
    profileExists: Boolean(row.employee_profile_id),
    name: row.name,
    externalEmployeeId: row.external_employee_id ?? null,
  };
}

async function assertNoExistingAccess(sql, organizationId, personId, email) {
  const rows = await sql`
    SELECT 1
    FROM organization_people op
    JOIN users u ON u.id = op.user_id
    WHERE op.organization_id = ${organizationId}
      AND (op.id = ${personId} OR lower(u.email) = ${email})
      AND op.status = 'ACTIVE'
  `;
  if (rows.length > 0) {
    const error = new HttpError(409, 'This person already has active access');
    error.code = 'ACCESS_ALREADY_ACTIVE';
    throw error;
  }
}

export async function createAccessInvitation(sql, ctx, input, {
  environment = process.env,
  send = undefined,
  now = new Date(),
} = {}) {
  assertInvitationActor(ctx);
  requireFeature(ctx.plan, 'teamManagement', 'Inviting team members requires the Team plan.');
  await assertCurrentInvitationActor(sql, ctx, ctx.organizationId);

  const email = normalizeInvitationEmail(input?.email);
  const role = invitationRole(input?.role);
  const displayName = String(input?.displayName ?? '').trim().slice(0, 160);
  const locale = requireInvitationLocale(input?.locale);
  const employeeId = String(input?.employeeId ?? '').trim() || null;
  const employeeName = String(input?.employeeName ?? '').trim().slice(0, 160);
  const employeeExternalId = String(input?.externalEmployeeId ?? '').trim() || null;
  const employeeAreaId = String(input?.areaId ?? '').trim() || null;
  const { token, tokenHash } = createInvitationToken();
  let person = employeeId ? await resolveEmployeePerson(sql, ctx.organizationId, employeeId) : null;
  if (!employeeId && employeeName) {
    if (employeeAreaId) {
      const areaRows = await sql`SELECT 1 FROM areas WHERE id = ${employeeAreaId} AND organization_id = ${ctx.organizationId} AND active = TRUE`;
      if (areaRows.length === 0) throw new HttpError(400, 'The selected area is not available in this organization');
    }
    const newEmployeeId = randomUUID();
    person = {
      employeeId: newEmployeeId,
      personId: newEmployeeId,
      personExists: false,
      profileExists: false,
      name: employeeName,
      externalEmployeeId: employeeExternalId,
      newEmployee: true,
    };
  }
  const personId = person?.personId ?? randomUUID();
  if (personId) {
    await assertNoExistingAccess(sql, ctx.organizationId, personId, email);
  }
  const existingPending = await sql`
    SELECT 1 FROM user_access_invitations
    WHERE organization_id = ${ctx.organizationId}
      AND email_normalized = ${email} AND status = 'PENDING'
  `;
  if (existingPending.length > 0) {
    const error = new HttpError(409, 'A pending invitation already exists for this email');
    error.code = 'INVITATION_ALREADY_PENDING';
    throw error;
  }

  const expiresAt = new Date(now.getTime() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const invitationId = randomUUID();
  const queries = [];
  if (person?.newEmployee) {
    queries.push((txn) => employeeAreaId
      ? txn`INSERT INTO employees (id, organization_id, external_employee_id, name, status, area_id) VALUES (${person.employeeId}, ${ctx.organizationId}, ${person.externalEmployeeId}, ${person.name}, 'pending_access', ${employeeAreaId})`
      : txn`INSERT INTO employees (id, organization_id, external_employee_id, name, status) VALUES (${person.employeeId}, ${ctx.organizationId}, ${person.externalEmployeeId}, ${person.name}, 'pending_access')`);
  }
  if (!person?.personExists) {
    queries.push((txn) => txn`
      INSERT INTO organization_people (id, organization_id, user_id, status, created_at, updated_at)
      VALUES (${personId}, ${ctx.organizationId}, NULL, 'PENDING_INVITATION', ${now.toISOString()}, ${now.toISOString()})
    `);
  } else {
    queries.push((txn) => txn`
      UPDATE organization_people
      SET status = 'PENDING_INVITATION', updated_at = ${now.toISOString()}
      WHERE id = ${personId} AND organization_id = ${ctx.organizationId} AND user_id IS NULL
    `);
  }
  if (person && !person.profileExists) {
    queries.push((txn) => txn`
      INSERT INTO employee_profiles (
        id, organization_id, organization_person_id, external_employee_id, employee_name,
        employment_status, created_at, updated_at
      ) VALUES (
        ${person.employeeId}, ${ctx.organizationId}, ${personId}, ${person.externalEmployeeId},
        ${person.name}, 'ACTIVE', ${now.toISOString()}, ${now.toISOString()}
      )
    `);
  }
  queries.push((txn) => txn`
    INSERT INTO person_role_periods (
      organization_id, organization_person_id, role, valid_from, valid_to,
      created_by_user_id, source, created_at, updated_at
    ) VALUES (
      ${ctx.organizationId}, ${personId}, ${role}, CURRENT_DATE, NULL,
      ${ctx.user.id}, 'USER', ${now.toISOString()}, ${now.toISOString()}
    )
  `);
  queries.push((txn) => txn`
    INSERT INTO user_access_invitations (
      id, organization_id, organization_person_id, email_normalized, invited_by_user_id,
      token_hash, status, created_at, expires_at, last_sent_at, delivery_status, send_attempts, updated_at
    ) VALUES (
      ${invitationId}, ${ctx.organizationId}, ${personId}, ${email}, ${ctx.user.id},
      ${tokenHash}, 'PENDING', ${now.toISOString()}, ${expiresAt.toISOString()}, NULL,
      'NOT_SENT', 0, ${now.toISOString()}
    )
    RETURNING *
  `);
  let result;
  try {
    const responses = await sql.transaction((txn) => queries.map((query) => query(txn)));
    result = responses[responses.length - 1]?.[0];
  } catch (error) {
    if (error?.code === '23P01' || error?.code === '23505') {
      const conflict = new HttpError(409, 'The invitation conflicts with an existing access record');
      conflict.code = 'INVITATION_CONFLICT';
      throw conflict;
    }
    throw error;
  }

  const orgName = ctx.memberships.find((m) => m.organizationId === ctx.organizationId)?.organizationName ?? 'your organization';
  try {
    const transport = createEmailTransport({ environment, send });
    const emailMessage = buildInvitationEmail({
      appUrl: transport.config.appUrl,
      token,
      recipientName: displayName,
      organizationName: orgName,
      inviterName: ctx.user.displayName,
      role,
      locale,
      expiresAt,
    });
    const delivery = await transport.send({ to: email, ...emailMessage });
    await sql`
      UPDATE user_access_invitations
      SET last_sent_at = NOW(), last_delivery_at = NOW(), delivery_status = 'SENT',
          send_attempts = send_attempts + 1, updated_at = NOW()
      WHERE id = ${invitationId} AND status = 'PENDING'
    `;
    return { invitation: safeInvitation({ ...result, last_sent_at: now, last_delivery_at: now, delivery_status: 'SENT', send_attempts: 1 }), delivery: { status: 'SENT', id: delivery?.id ?? null } };
  } catch (error) {
    await sql`
      UPDATE user_access_invitations
      SET last_sent_at = NOW(), delivery_status = 'FAILED', send_attempts = send_attempts + 1, updated_at = NOW()
      WHERE id = ${invitationId} AND status = 'PENDING'
    `;
    return { invitation: safeInvitation({ ...result, last_sent_at: now, delivery_status: 'FAILED', send_attempts: 1 }), delivery: { status: 'FAILED', code: error?.code === 'EMAIL_CONFIG_INVALID' ? error.code : 'EMAIL_SEND_FAILED' } };
  }
}

export async function listAccessDirectory(sql, ctx) {
  assertInvitationActor(ctx);
  const [people, invitations] = await Promise.all([
    sql`
      SELECT op.id, op.user_id, op.status, u.email, u.display_name, u.account_status,
             ep.id AS employee_id, ep.employee_name, ep.employment_status,
             e.external_employee_id, e.id AS legacy_employee_id,
             COALESCE((SELECT prp.role FROM person_role_periods prp
               WHERE prp.organization_person_id = op.id AND prp.organization_id = op.organization_id
                 AND prp.valid_from <= CURRENT_DATE AND (prp.valid_to IS NULL OR prp.valid_to >= CURRENT_DATE)
               ORDER BY prp.valid_from DESC LIMIT 1), m.role) AS role
      FROM organization_people op
      LEFT JOIN users u ON u.id = op.user_id
      LEFT JOIN memberships m ON m.organization_id = op.organization_id AND m.user_id = op.user_id
      LEFT JOIN employee_profiles ep ON ep.organization_person_id = op.id AND ep.organization_id = op.organization_id
      LEFT JOIN employees e ON e.id = ep.id AND e.organization_id = ep.organization_id
      WHERE op.organization_id = ${ctx.organizationId}
      ORDER BY COALESCE(u.display_name, ep.employee_name, u.email) ASC
    `,
    sql`
      SELECT i.*, ep.employee_name, u.display_name AS inviter_display_name
      FROM user_access_invitations i
      LEFT JOIN employee_profiles ep ON ep.organization_person_id = i.organization_person_id
        AND ep.organization_id = i.organization_id
      LEFT JOIN users u ON u.id = i.invited_by_user_id
      WHERE i.organization_id = ${ctx.organizationId}
      ORDER BY i.created_at DESC
    `,
  ]);
  return {
    people: people.map((row) => ({
      id: row.id,
      userId: row.user_id ?? null,
      email: row.email ?? null,
      displayName: row.display_name ?? row.employee_name ?? null,
      accountStatus: row.account_status ?? null,
      status: row.status,
      role: row.role ?? null,
      employeeId: row.legacy_employee_id ?? row.employee_id ?? null,
      employeeName: row.employee_name ?? null,
      employmentStatus: row.employment_status ?? null,
      externalEmployeeId: row.external_employee_id ?? null,
    })),
    invitations: invitations.map((row) => ({
      ...safeInvitation(row),
      employeeName: row.employee_name ?? null,
      inviterDisplayName: row.inviter_display_name ?? null,
    })),
  };
}

export async function validateAccessInvitation(sql, token) {
  if (!isValidInvitationToken(token)) {
    const error = new HttpError(404, 'This invitation is not available');
    error.code = 'INVITATION_INVALID';
    throw error;
  }
  const tokenHash = createHash('sha256').update(String(token ?? '')).digest('hex');
  const rows = await sql`
    SELECT i.id, i.organization_id, i.organization_person_id, i.email_normalized, i.status,
           i.created_at, i.expires_at, o.name AS organization_name,
           u.account_status,
           ep.employee_name,
           COALESCE((SELECT prp.role FROM person_role_periods prp
             WHERE prp.organization_person_id = i.organization_person_id AND prp.organization_id = i.organization_id
             ORDER BY prp.valid_from DESC LIMIT 1), 'EMPLOYEE') AS role
    FROM user_access_invitations i
    JOIN organizations o ON o.id = i.organization_id
    LEFT JOIN users u ON lower(u.email) = i.email_normalized
    LEFT JOIN employee_profiles ep ON ep.organization_person_id = i.organization_person_id
      AND ep.organization_id = i.organization_id
    WHERE i.token_hash = ${tokenHash}
  `;
  const row = rows[0];
  const state = invitationPublicState(row);
  if (state !== 'VALID') {
    const error = new HttpError(404, 'This invitation is not available');
    error.code = state === 'EXPIRED' ? 'INVITATION_EXPIRED' : 'INVITATION_INVALID';
    throw error;
  }
  // Do not reveal whether the recipient has an account that is globally
  // suspended. A valid token still receives the same public invalid response.
  if (row.account_status === 'SUSPENDED') {
    const error = new HttpError(404, 'This invitation is not available');
    error.code = 'INVITATION_INVALID';
    throw error;
  }
  return {
    status: 'VALID',
    invitationId: row.id,
    organizationName: row.organization_name,
    role: row.role,
    employeeName: row.employee_name ?? null,
    email: row.email_normalized,
    expiresAt: row.expires_at,
    acceptanceMode: row.account_status === 'ACTIVE' ? 'LINK_EXISTING' : 'CREATE_ACCOUNT',
  };
}

export async function acceptAccessInvitation(sql, input, { createSessionFn = null } = {}) {
  const token = String(input?.token ?? '').trim();
  if (!isValidInvitationToken(token)) {
    const error = new HttpError(400, 'Invitation token is invalid');
    error.code = 'INVITATION_TOKEN_INVALID';
    throw error;
  }
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const email = normalizeInvitationEmail(input?.email);
  const password = String(input?.password ?? '');
  const passwordConfirmation = String(input?.passwordConfirmation ?? '');
  const locale = input?.locale === 'en' ? 'en' : 'es';
  const theme = ['system', 'light', 'dark'].includes(input?.theme) ? input.theme : 'system';
  const displayName = String(input?.displayName ?? '').trim().slice(0, 160);

  const invitationRows = await sql`
    SELECT i.status, i.expires_at, i.email_normalized, u.account_status
    FROM user_access_invitations i
    LEFT JOIN users u ON lower(u.email) = i.email_normalized
    WHERE i.token_hash = ${tokenHash}
  `;
  const invitation = invitationRows[0];
  const invitationState = invitationPublicState(invitation);
  if (!invitation || invitationState !== 'VALID' || invitation.email_normalized !== email) {
    const error = new HttpError(409, 'This invitation cannot be accepted');
    error.code = invitation?.status === 'ACCEPTED' ? 'INVITATION_ALREADY_ACCEPTED'
      : invitation?.status === 'REVOKED' ? 'INVITATION_REVOKED'
        : invitation?.status === 'EXPIRED' || (invitation && new Date(invitation.expires_at) <= new Date()) ? 'INVITATION_EXPIRED'
          : 'INVITATION_INVALID';
    throw error;
  }
  if (invitation.account_status === 'SUSPENDED') {
    const error = new HttpError(409, 'This invitation cannot be accepted');
    error.code = 'INVITATION_INVALID';
    throw error;
  }

  const acceptanceMode = invitation.account_status === 'ACTIVE' ? 'LINK_EXISTING' : 'CREATE_ACCOUNT';
  if (acceptanceMode === 'LINK_EXISTING' && (password || passwordConfirmation)) {
    const error = new HttpError(400, 'This existing account does not accept a password here');
    error.code = 'PASSWORD_NOT_ALLOWED';
    throw error;
  }
  if (acceptanceMode === 'CREATE_ACCOUNT' && !displayName) {
    const error = new HttpError(400, 'A display name is required to activate a new account');
    error.code = 'DISPLAY_NAME_REQUIRED';
    throw error;
  }
  if (password && password.length < 8) {
    const error = new HttpError(400, 'Password must be at least 8 characters');
    error.code = 'PASSWORD_TOO_SHORT';
    throw error;
  }
  if (password !== passwordConfirmation) {
    const error = new HttpError(400, 'Passwords do not match');
    error.code = 'PASSWORD_MISMATCH';
    throw error;
  }
  const passwordHash = acceptanceMode === 'CREATE_ACCOUNT' && password ? hashPassword(password) : null;
  if (acceptanceMode === 'CREATE_ACCOUNT' && !passwordHash) {
    const error = new HttpError(400, 'A password is required to activate a new account');
    error.code = 'PASSWORD_REQUIRED';
    throw error;
  }
  const result = await sql.transaction((txn) => [txn`
    WITH invitation AS MATERIALIZED (
      SELECT i.*
      FROM user_access_invitations i
      WHERE i.token_hash = ${tokenHash} AND i.status = 'PENDING'
        AND i.expires_at > NOW() AND i.email_normalized = ${email}
      FOR UPDATE
    ), existing_user AS MATERIALIZED (
      SELECT u.* FROM users u JOIN invitation i ON lower(u.email) = i.email_normalized FOR UPDATE
    ), new_user AS (
      INSERT INTO users (email, password_hash, display_name, account_status)
      SELECT i.email_normalized, ${passwordHash}, ${displayName}, 'ACTIVE'
      FROM invitation i
      WHERE ${acceptanceMode === 'CREATE_ACCOUNT'}
        AND NOT EXISTS (SELECT 1 FROM existing_user)
      RETURNING *
    ), resolved_user AS (
      SELECT * FROM existing_user UNION ALL SELECT * FROM new_user
    ), checked_user AS (
      SELECT u.* FROM resolved_user u
      WHERE u.account_status IN ('ACTIVE', 'PENDING_INVITATION')
    ), updated_user AS (
      UPDATE users u SET
        password_hash = CASE WHEN u.account_status = 'PENDING_INVITATION' THEN ${passwordHash} ELSE u.password_hash END,
        account_status = CASE WHEN u.account_status = 'PENDING_INVITATION' THEN 'ACTIVE' ELSE u.account_status END,
        display_name = CASE WHEN u.account_status = 'PENDING_INVITATION' AND ${displayName} <> '' THEN ${displayName} ELSE u.display_name END
      FROM checked_user cu WHERE u.id = cu.id
      RETURNING u.*
    ), final_user AS (
      SELECT * FROM updated_user UNION ALL
      SELECT cu.* FROM checked_user cu WHERE NOT EXISTS (SELECT 1 FROM updated_user)
    ), person AS (
      UPDATE organization_people op SET user_id = fu.id, status = 'ACTIVE', updated_at = NOW()
      FROM invitation i CROSS JOIN final_user fu
      WHERE op.id = i.organization_person_id AND op.organization_id = i.organization_id
      RETURNING op.*
    ), role_row AS (
      SELECT i.organization_id, i.organization_person_id,
        COALESCE((SELECT prp.role FROM person_role_periods prp
          WHERE prp.organization_id = i.organization_id AND prp.organization_person_id = i.organization_person_id
          ORDER BY prp.valid_from DESC LIMIT 1), 'EMPLOYEE') AS role
      FROM invitation i
    ), membership AS (
      INSERT INTO memberships (user_id, organization_id, role, planner_scope_type)
      SELECT fu.id, rr.organization_id, rr.role, CASE WHEN rr.role = 'PLANNER' THEN 'ORGANIZATION' ELSE NULL END
      FROM final_user fu CROSS JOIN role_row rr
      ON CONFLICT (user_id, organization_id) DO NOTHING
      RETURNING user_id
    ), legacy_employee AS (
      UPDATE employees e SET user_id = fu.id, status = 'active', deactivated_at = NULL, updated_at = NOW()
      FROM employee_profiles ep JOIN invitation i ON i.organization_person_id = ep.organization_person_id
        AND i.organization_id = ep.organization_id CROSS JOIN final_user fu
      WHERE e.id = ep.id AND e.organization_id = ep.organization_id
      RETURNING e.id
    ), preferences AS (
      INSERT INTO user_preferences (user_id, locale, theme)
      SELECT fu.id, ${locale}, ${theme} FROM final_user fu
      ON CONFLICT (user_id) DO NOTHING
      RETURNING user_id
    ), accepted AS (
      UPDATE user_access_invitations i SET status = 'ACCEPTED', accepted_at = NOW(), updated_at = NOW()
      FROM final_user fu WHERE i.token_hash = ${tokenHash} AND i.status = 'PENDING'
      RETURNING i.id, i.organization_id, fu.id AS user_id
    )
    SELECT * FROM accepted
  `]);
  const accepted = result?.[0]?.[0];
  if (!accepted) {
    const check = await sql`
      SELECT status, expires_at FROM user_access_invitations WHERE token_hash = ${tokenHash}
    `;
    const row = check[0];
    const error = new HttpError(409, 'This invitation cannot be accepted');
    error.code = row?.status === 'ACCEPTED' ? 'INVITATION_ALREADY_ACCEPTED'
      : row?.status === 'REVOKED' ? 'INVITATION_REVOKED'
        : row?.status === 'EXPIRED' || (row && new Date(row.expires_at) <= new Date()) ? 'INVITATION_EXPIRED'
          : 'INVITATION_INVALID';
    throw error;
  }
  if (createSessionFn) {
    return { ...accepted, session: await createSessionFn(accepted.user_id) };
  }
  return { ...accepted };
}

export async function revokeAccessInvitation(sql, ctx, invitationId) {
  assertInvitationActor(ctx);
  const rows = await sql`
    SELECT i.*, op.status AS person_status, ep.id AS employee_profile_id
    FROM user_access_invitations i
    LEFT JOIN organization_people op ON op.id = i.organization_person_id AND op.organization_id = i.organization_id
    LEFT JOIN employee_profiles ep ON ep.organization_person_id = op.id AND ep.organization_id = op.organization_id
    WHERE i.id = ${invitationId} AND i.organization_id = ${ctx.organizationId}
  `;
  const row = rows[0];
  if (!row) throw new HttpError(404, 'Invitation not found');
  if (row.status !== 'PENDING') throw new HttpError(409, 'This invitation is already closed');
  if (row.employee_profile_id) {
    const error = new HttpError(409, 'An employee pending invitation must be replaced or accepted to preserve the employee invariant');
    error.code = 'EMPLOYEE_PENDING_INVITATION_REQUIRES_REPLACEMENT';
    throw error;
  }
  await sql.transaction((txn) => [
    txn`UPDATE organization_people SET status = 'INACTIVE', updated_at = NOW() WHERE id = ${row.organization_person_id} AND organization_id = ${ctx.organizationId} AND user_id IS NULL`,
    txn`UPDATE user_access_invitations SET status = 'REVOKED', revoked_at = NOW(), updated_at = NOW() WHERE id = ${invitationId} AND organization_id = ${ctx.organizationId} AND status = 'PENDING'`,
  ]);
  return { id: invitationId, status: 'REVOKED' };
}

export async function resendAccessInvitation(sql, ctx, invitationId, options = {}) {
  assertInvitationActor(ctx);
  const locale = requireInvitationLocale(options.locale);
  const rows = await sql`
    SELECT i.*, o.name AS organization_name, u.display_name AS inviter_name,
      ep.employee_name,
      COALESCE((SELECT prp.role FROM person_role_periods prp WHERE prp.organization_id = i.organization_id
        AND prp.organization_person_id = i.organization_person_id ORDER BY prp.valid_from DESC LIMIT 1), 'EMPLOYEE') AS role
    FROM user_access_invitations i
    JOIN organizations o ON o.id = i.organization_id
    JOIN users u ON u.id = i.invited_by_user_id
    LEFT JOIN employee_profiles ep ON ep.organization_person_id = i.organization_person_id AND ep.organization_id = i.organization_id
    WHERE i.id = ${invitationId} AND i.organization_id = ${ctx.organizationId}
  `;
  const row = rows[0];
  if (!row || row.status !== 'PENDING') throw new HttpError(409, 'Only pending invitations can be resent');
  const { token, tokenHash } = createInvitationToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const replacementId = randomUUID();
  await sql.transaction((txn) => [
    txn`UPDATE user_access_invitations SET status = 'REVOKED', revoked_at = ${now.toISOString()}, updated_at = ${now.toISOString()} WHERE id = ${invitationId} AND status = 'PENDING'`,
    txn`INSERT INTO user_access_invitations (id, organization_id, organization_person_id, email_normalized, invited_by_user_id, token_hash, status, created_at, expires_at, delivery_status, updated_at)
      VALUES (${replacementId}, ${ctx.organizationId}, ${row.organization_person_id}, ${row.email_normalized}, ${ctx.user.id}, ${tokenHash}, 'PENDING', ${now.toISOString()}, ${expiresAt.toISOString()}, 'NOT_SENT', ${now.toISOString()})`,
  ]);
  try {
    const transport = createEmailTransport({ environment: options.environment ?? process.env, send: options.send });
    const email = buildInvitationEmail({
      appUrl: transport.config.appUrl, token, recipientName: row.employee_name,
      organizationName: row.organization_name, inviterName: ctx.user.displayName,
      role: row.role, locale, expiresAt,
    });
    const delivery = await transport.send({ to: row.email_normalized, ...email });
    await sql`UPDATE user_access_invitations SET last_sent_at = NOW(), last_delivery_at = NOW(), delivery_status = 'SENT', send_attempts = 1, updated_at = NOW() WHERE id = ${replacementId}`;
    return { invitationId: replacementId, status: 'SENT', deliveryId: delivery?.id ?? null };
  } catch (error) {
    await sql`UPDATE user_access_invitations SET last_sent_at = NOW(), delivery_status = 'FAILED', send_attempts = 1, updated_at = NOW() WHERE id = ${replacementId}`;
    return { invitationId: replacementId, status: 'FAILED', code: error?.code === 'EMAIL_CONFIG_INVALID' ? error.code : 'EMAIL_SEND_FAILED' };
  }
}
