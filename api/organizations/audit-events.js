import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { listAuditEvents } from '../_lib/data.js';
import { handleError, sendJson } from '../_lib/http.js';

/** GET /api/organizations/audit-events — OWNER/ADMIN organization audit log. */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const result = await listAuditEvents(sql, ctx, {
      eventType: req.query?.eventType,
      from: req.query?.from,
      to: req.query?.to,
      page: req.query?.page,
      pageSize: req.query?.pageSize,
    });
    return sendJson(res, 200, result);
  } catch (error) {
    return handleError(res, error);
  }
}
