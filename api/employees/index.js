import { getSql, resolveContext } from '../_lib/auth.js';
import { createEmployee, findEmployeeMatch, listEmployees, updateEmployee } from '../_lib/data.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * GET  /api/employees                — org-scoped list (EMPLOYEE sees only self)
 * GET  /api/employees?match=1        — matching for the importer (body-less:
 *                                      externalId/name as query params)
 * POST /api/employees                — create (MANAGER+, inline alta flow)
 * PATCH /api/employees               — update/deactivate/link user (ADMIN)
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = await resolveContext(req, sql);
    if (!ctx || !ctx.organizationId) {
      return sendJson(res, 401, { error: 'Not authenticated' });
    }

    if (req.method === 'GET') {
      if (req.query?.match === '1') {
        const result = await findEmployeeMatch(sql, ctx, {
          externalEmployeeId: req.query?.externalEmployeeId,
          name: req.query?.name,
        });
        return sendJson(res, 200, result);
      }
      const employees = await listEmployees(sql, ctx);
      return sendJson(res, 200, { employees });
    }

    if (req.method === 'POST') {
      const employee = await createEmployee(sql, ctx, req.body ?? {});
      return sendJson(res, 201, { employee });
    }

    if (req.method === 'PATCH') {
      const employee = await updateEmployee(sql, ctx, req.body ?? {});
      return sendJson(res, 200, { employee });
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
