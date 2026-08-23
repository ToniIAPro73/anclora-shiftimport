import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { bulkCreateEmployees } from '../_lib/data.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * POST /api/employees/bulk — create many employees in one request (ADMIN+,
 * "create all new employees" multi-import flow). Body: { employees: [{ key,
 * name, externalEmployeeId?, areaId?, areaName? }] }. `key` is a
 * client-supplied correlation id, echoed back per result, never stored.
 * `areaId` is validated against the org's active areas; `areaName` is
 * resolved against the org's active areas (normalized name/code). An unknown
 * area fails only that row (reason 'unknown_area') and is never auto-created.
 * Never creates a User.
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const result = await bulkCreateEmployees(sql, ctx, req.body?.employees ?? []);
    return sendJson(res, 200, result);
  } catch (error) {
    return handleError(res, error);
  }
}
