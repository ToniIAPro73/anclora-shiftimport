import { createSession, getSql, sessionCookieHeader } from '../_lib/auth.js';
import { hashPassword } from '../_lib/passwords.js';
import { handleError, sendJson } from '../_lib/http.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * B2C bootstrap: creates the user, a personal organization, an ADMIN
 * membership and the self-linked Employee, then opens a session.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const { email, password, displayName } = req.body ?? {};
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    const name = String(displayName ?? '').trim();

    if (!EMAIL_RE.test(normalizedEmail)) {
      return sendJson(res, 400, { error: 'Invalid email' });
    }
    if (String(password ?? '').length < 8) {
      return sendJson(res, 400, { error: 'Password must be at least 8 characters' });
    }

    const sql = getSql();
    const existing = await sql`SELECT id FROM users WHERE lower(email) = ${normalizedEmail}`;
    if (existing.length > 0) {
      return sendJson(res, 409, { error: 'Email already registered' });
    }

    const userRows = await sql`
      INSERT INTO users (email, password_hash, display_name)
      VALUES (${normalizedEmail}, ${hashPassword(String(password))}, ${name})
      RETURNING id, email, display_name
    `;
    const user = userRows[0];

    const orgRows = await sql`
      INSERT INTO organizations (name, type)
      VALUES (${name || normalizedEmail}, 'personal')
      RETURNING id, name, type
    `;
    const org = orgRows[0];

    await sql`
      INSERT INTO memberships (user_id, organization_id, role)
      VALUES (${user.id}, ${org.id}, 'ADMIN')
    `;

    // Self employee so the B2C import flow works without extra setup.
    await sql`
      INSERT INTO employees (organization_id, name, user_id)
      VALUES (${org.id}, ${name || normalizedEmail}, ${user.id})
    `;

    const { token, expiresAt } = await createSession(sql, user.id);
    res.setHeader('Set-Cookie', sessionCookieHeader(req, token, expiresAt));

    return sendJson(res, 201, {
      user: { id: user.id, email: user.email, displayName: user.display_name },
      organizations: [{ id: org.id, name: org.name, type: org.type, role: 'ADMIN' }],
    });
  } catch (error) {
    return handleError(res, error);
  }
}
