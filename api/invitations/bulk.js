import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { updateMemberRole } from '../_lib/data.js';
import {
  createAccessInvitation,
  normalizeInvitationEmail,
} from '../_lib/invitations.js';
import { handleError, sendJson } from '../_lib/http.js';

const MAX_ROWS = 500;
const MAX_BODY_BYTES = 1_000_000;
const MAX_CONCURRENCY = 3;
const ROLES = new Set(['ADMIN', 'PLANNER', 'EMPLOYEE']);

function rowResult(row, result) {
  return {
    row: row.row,
    key: String(row.key ?? row.row),
    email: row.email,
    status: result.status,
    invitationStatus: result.invitationStatus ?? null,
    deliveryStatus: result.deliveryStatus ?? null,
    code: result.code ?? null,
  };
}

function errorResult(row, error) {
  const code = error?.code ?? 'IMPORT_ROW_FAILED';
  return rowResult(row, { status: 'ERROR', code });
}

async function resolveEmployee(sql, organizationId, externalEmployeeId) {
  const externalId = String(externalEmployeeId ?? '').trim();
  if (!externalId) return null;
  const rows = await sql`
    SELECT id, user_id, status
    FROM employees
    WHERE organization_id = ${organizationId} AND external_employee_id = ${externalId}
  `;
  if (rows.length === 0) {
    const error = new Error('Employee not found');
    error.status = 400;
    error.code = 'EMPLOYEE_NOT_FOUND';
    throw error;
  }
  if (rows.length > 1) {
    const error = new Error('Employee reference is ambiguous');
    error.status = 409;
    error.code = 'EMPLOYEE_REFERENCE_AMBIGUOUS';
    throw error;
  }
  if (rows[0].user_id || rows[0].status === 'inactive') {
    const error = new Error('Employee cannot receive access');
    error.status = 409;
    error.code = rows[0].user_id ? 'EMPLOYEE_ALREADY_LINKED' : 'EMPLOYEE_INACTIVE';
    throw error;
  }
  return rows[0];
}

async function processRow(sql, ctx, row, { environment, send, defaultLocale }) {
  const email = normalizeInvitationEmail(row.email);
  const role = String(row.role ?? '').trim().toUpperCase();
  if (!ROLES.has(role)) {
    const error = new Error('Role cannot be assigned by CSV');
    error.status = 400;
    error.code = role === 'OWNER' ? 'OWNER_NOT_ASSIGNABLE' : 'INVALID_ROLE';
    throw error;
  }
  const locale = row.locale === 'en' || row.locale === 'es' ? row.locale : defaultLocale;
  const employee = await resolveEmployee(sql, ctx.organizationId, row.externalEmployeeId);
  const users = await sql`
    SELECT u.id, u.account_status, m.role AS membership_role
    FROM users u
    LEFT JOIN memberships m ON m.user_id = u.id AND m.organization_id = ${ctx.organizationId}
    WHERE lower(u.email) = ${email}
  `;
  const user = users[0] ?? null;
  if (user?.account_status === 'SUSPENDED') {
    const error = new Error('Account is not available');
    error.status = 409;
    error.code = 'ACCOUNT_UNAVAILABLE';
    throw error;
  }
  if (user?.membership_role) {
    if (employee) {
      const linked = await sql`
        SELECT 1 FROM employees
        WHERE id = ${employee.id} AND organization_id = ${ctx.organizationId} AND user_id = ${user.id}
      `;
      if (linked.length === 0) {
        const error = new Error('Employee is already associated with another access record');
        error.status = 409;
        error.code = 'EMPLOYEE_ACCESS_CONFLICT';
        throw error;
      }
    }
    if (user.membership_role === role) {
      return rowResult({ ...row, email }, { status: 'UNCHANGED' });
    }
    await updateMemberRole(sql, ctx, { userId: user.id, role });
    return rowResult({ ...row, email }, { status: 'UPDATE_ROLE' });
  }

  const pending = await sql`
    SELECT id, status FROM user_access_invitations
    WHERE organization_id = ${ctx.organizationId}
      AND email_normalized = ${email} AND status = 'PENDING'
  `;
  if (pending.length > 0) {
    return rowResult({ ...row, email }, { status: 'UNCHANGED_PENDING', invitationStatus: 'PENDING' });
  }

  const created = await createAccessInvitation(sql, ctx, {
    email,
    displayName: String(row.displayName ?? '').trim(),
    role,
    employeeId: employee?.id ?? null,
    externalEmployeeId: row.externalEmployeeId,
    locale,
  }, { environment, send });
  return rowResult({ ...row, email }, {
    status: 'INVITED',
    invitationStatus: created.invitation.status,
    deliveryStatus: created.delivery.status,
    code: created.delivery.status === 'FAILED' ? (created.delivery.code ?? 'EMAIL_SEND_FAILED') : null,
  });
}

async function mapWithConcurrency(items, worker, concurrency = MAX_CONCURRENCY) {
  const results = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index]);
      } catch (error) {
        results[index] = errorResult(items[index], error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

/** POST /api/invitations/bulk — secure CSV access provisioning. */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const bodySize = JSON.stringify(req.body ?? {}).length;
    if (bodySize > MAX_BODY_BYTES) return sendJson(res, 413, { error: 'Request body is too large' });
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const rows = Array.isArray(req.body?.users) ? req.body.users : [];
    if (rows.length === 0 || rows.length > MAX_ROWS) {
      return sendJson(res, 400, { error: 'A valid CSV row set is required', code: 'INVALID_ROW_COUNT' });
    }
    const defaultLocale = req.body?.locale === 'en' ? 'en' : 'es';
    const results = await mapWithConcurrency(rows.map((row, index) => ({ ...row, row: index + 1, key: row?.key ?? String(index + 1) })),
      (row) => processRow(sql, ctx, row, {
        environment: process.env,
        send: undefined,
        defaultLocale,
      }));
    return sendJson(res, 200, {
      results,
      summary: results.reduce((summary, result) => {
        const key = result.status === 'INVITED' ? 'invited'
          : result.status === 'UPDATE_ROLE' ? 'updated'
            : result.status === 'UNCHANGED' || result.status === 'UNCHANGED_PENDING' ? 'unchanged' : 'failed';
        summary[key] += 1;
        return summary;
      }, { invited: 0, updated: 0, unchanged: 0, failed: 0 }),
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export { mapWithConcurrency };
