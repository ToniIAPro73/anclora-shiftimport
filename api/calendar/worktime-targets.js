import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { createWorktimeTargetVersion, listWorktimeTargets } from '../_lib/calendar.js';
import { handleError, sendJson } from '../_lib/http.js';

/** Versioned, tenant-scoped worktime targets. Writes always create a revision. */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    if (req.method === 'GET') {
      const targets = await listWorktimeTargets(sql, ctx, String(req.query?.employeeId ?? '').trim(), {
        asOf: String(req.query?.asOf ?? '').trim() || undefined,
        history: req.query?.history === 'true' || (!req.query?.asOf && req.query?.history !== 'false'),
      });
      return sendJson(res, 200, { targets });
    }
    if (req.method === 'POST') {
      const target = await createWorktimeTargetVersion(sql, ctx, req.body ?? {});
      return sendJson(res, 201, { target });
    }
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
