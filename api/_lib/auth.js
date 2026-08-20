import { createHash, randomBytes } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

export const SESSION_COOKIE = 'anclora_session';
const SESSION_TTL_DAYS = 30;

let cachedSql = null;

export function getSql() {
  if (cachedSql) {
    return cachedSql;
  }
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }
  cachedSql = neon(connectionString);
  return cachedSql;
}

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export function parseSessionToken(req) {
  const header = String(req.headers?.cookie ?? '');
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

export function sessionCookieHeader(req, token, expiresAt) {
  const secure = req.headers?.['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}; Expires=${expiresAt.toUTCString()}`;
}

export function clearSessionCookieHeader(req) {
  const secure = req.headers?.['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secure}; Expires=${new Date(0).toUTCString()}`;
}

export async function createSession(sql, userId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await sql`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES (${hashToken(token)}, ${userId}, ${expiresAt.toISOString()})
  `;
  return { token, expiresAt };
}

export async function destroySession(sql, token) {
  if (!token) {
    return;
  }
  await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
}

/**
 * Resolves the request security context. NEVER trusts client-sent ids:
 * organization comes from the session's memberships, employees come from the
 * organization itself.
 *
 * Returns null when unauthenticated. Shape:
 * { user, organizationId, role, employeeId, memberships }
 * - employeeId: the Employee linked to this user inside the active org, when
 *   one exists. EMPLOYEE-role requests are always forced through it.
 */
export async function resolveContext(req, sql) {
  const token = parseSessionToken(req);
  if (!token) {
    return null;
  }

  const rows = await sql`
    SELECT u.id, u.email, u.display_name, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)}
      AND s.expires_at > NOW()
  `;
  if (rows.length === 0) {
    return null;
  }
  const user = { id: rows[0].id, email: rows[0].email, displayName: rows[0].display_name };

  const memberships = await sql`
    SELECT m.organization_id, m.role, o.name AS organization_name, o.type AS organization_type
    FROM memberships m
    JOIN organizations o ON o.id = m.organization_id
    WHERE m.user_id = ${user.id}
  `;
  if (memberships.length === 0) {
    return { user, organizationId: null, role: null, employeeId: null, memberships: [] };
  }

  // Client may request an org via header, but only one it actually belongs to.
  // No silent fallback to the first membership: with several organizations
  // and no explicit valid selection the context has NO active organization
  // and data endpoints must refuse to serve (explicit selection required).
  const requestedOrg = String(req.headers?.['x-organization-id'] ?? '').trim();
  const membership = requestedOrg
    ? memberships.find((m) => m.organization_id === requestedOrg) ?? null
    : (memberships.length === 1 ? memberships[0] : null);

  let employeeId = null;
  if (membership) {
    const employeeRows = await sql`
      SELECT id FROM employees
      WHERE organization_id = ${membership.organization_id}
        AND user_id = ${user.id}
        AND status = 'active'
    `;
    employeeId = employeeRows[0]?.id ?? null;
  }

  return {
    user,
    organizationId: membership?.organization_id ?? null,
    role: membership?.role ?? null,
    employeeId,
    memberships: memberships.map((m) => ({
      organizationId: m.organization_id,
      organizationName: m.organization_name,
      organizationType: m.organization_type,
      role: m.role,
    })),
  };
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Guards an endpoint: 401 without session, 400 when the session has no
 * active organization (multi-org users must select one explicitly).
 */
export function requireOrgContext(ctx) {
  if (!ctx) {
    throw new HttpError(401, 'Not authenticated');
  }
  if (!ctx.organizationId) {
    throw new HttpError(400, 'Organization selection required');
  }
  return ctx;
}

/** Role guard: ADMIN > MANAGER > EMPLOYEE. */
export function requireRole(ctx, minimum) {
  const rank = { EMPLOYEE: 1, MANAGER: 2, ADMIN: 3 };
  if (!ctx?.role || rank[ctx.role] < rank[minimum]) {
    throw new HttpError(403, 'Insufficient role');
  }
}
