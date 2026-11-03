import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { logApprovalAuthorizationDenied } from '../_lib/approval.js';
import { handleError, sendJson } from '../_lib/http.js';
import { isTimeOffEnabled } from '../_lib/flags.js';
import { approveTimeOffRequest } from '../_lib/time-off-approvals.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const BULK_APPROVE_MAX = 50;

const NOT_FOUND = Object.freeze({ ok: false, status: 404, code: 'NOT_FOUND' });

const failure = (id, status, code, extra = {}) => ({ id, ok: false, status, code, ...extra });

/** Machine-readable code of a per-item failure; the free-text message is never returned for a bulk item. */
function codeFor(error) {
  if (error?.code) return String(error.code);
  if (error?.status === 403) return 'FORBIDDEN';
  if (error?.status === 404) return 'NOT_FOUND';
  if (error?.status === 409) return 'ALREADY_RESOLVED';
  return 'ERROR';
}

/**
 * POST /api/approval-requests/bulk-approve — `{ ids: string[] }` (1–50), TIME_OFF only (spec §4.3.3).
 *
 * Not atomic across items: each id is decided by the SAME function the single approval uses (`approveTimeOffRequest`), so scope
 * (ORGANIZATION / AREAS / EMPLOYEES), anti-self-approval (by userId and employeeId), the approval policy, OD-08 and the F3
 * materialisation are enforced per item with no copy of those rules here. One ineligible item never blocks (or approves) the rest.
 * Items run one after another: they may touch the same days and the single approval already guards its own concurrency (409).
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    if (!isTimeOffEnabled()) return sendJson(res, 404, { error: 'Not found' });

    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    if (ctx.role !== 'OWNER' && ctx.role !== 'ADMIN' && ctx.role !== 'PLANNER') {
      logApprovalAuthorizationDenied({ endpoint: 'POST /api/approval-requests/bulk-approve', ctx, reason: 'role_insufficient' });
      return sendJson(res, 403, { error: 'Approver access required' });
    }

    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > BULK_APPROVE_MAX || ids.some((id) => typeof id !== 'string')) {
      return sendJson(res, 400, { error: `ids must be an array of 1 to ${BULK_APPROVE_MAX} strings`, code: 'INVALID_INPUT' });
    }
    const unique = [...new Set(ids.map((id) => id.trim()))];

    const results = [];
    for (const id of unique) {
      if (!UUID_RE.test(id)) {
        results.push({ id, ...NOT_FOUND });
        continue;
      }
      try {
        const decided = await approveTimeOffRequest(sql, ctx, id);
        if (decided) {
          results.push({
            id, ok: true, status: 'APPROVED',
            requestedDays: decided.requestedDays, materializedDays: decided.materializedDays, skippedPastDays: decided.skippedPastDays,
          });
          continue;
        }
        // Not a time-off subject for this tenant: a shift change (unsupported in bulk) or no such request.
        const [envelope] = await sql`
          SELECT 1 AS found FROM approval_requests
          WHERE id = ${id} AND organization_id = ${ctx.organizationId} AND change_request_id IS NOT NULL
        `;
        results.push(envelope ? failure(id, 422, 'BULK_KIND_UNSUPPORTED') : { id, ...NOT_FOUND });
      } catch (error) {
        if (error?.status >= 400 && error?.status < 500) {
          results.push(failure(id, error.status, codeFor(error), error.decision ? { decision: error.decision } : {}));
        } else {
          console.error('[api] bulk-approve item failed', { id, message: error?.message });
          results.push(failure(id, 500, 'ERROR'));
        }
      }
    }

    const approved = results.filter((item) => item.ok).length;
    return sendJson(res, 200, { results, summary: { requested: unique.length, approved, failed: unique.length - approved } });
  } catch (error) {
    return handleError(res, error);
  }
}
