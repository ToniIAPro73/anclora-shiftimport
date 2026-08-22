import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { createEmployee, deleteEmployee, findEmployeeMatch, listEmployees, updateEmployee, updateEmployeeName } from '../_lib/data.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * GET  /api/employees                — org-scoped list (EMPLOYEE sees only self)
 * GET  /api/employees?match=1        — matching for the importer (body-less:
 *                                      externalId/name as query params)
 * POST /api/employees                — create (MANAGER+, inline alta flow)
 * PATCH /api/employees               — update/deactivate/link user (ADMIN)
 * DELETE /api/employees              — permanent delete, only without shift
 *                                      history (ADMIN)
 * PATCH /api/employees/self          — update own employee name (EMPLOYEE+)
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));

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
      // /api/employees/self for EMPLOYEE to update their own name
      if (String(req.query?.self ?? '') === 'true') {
        if (!ctx.employeeId) {
          return sendJson(res, 403, { error: 'No employee linked to this user' });
        }
        const name = String(req.body?.name ?? '').trim();
        if (!name) {
          return sendJson(res, 400, { error: 'Employee name is required' });
        }
        const employee = await updateEmployeeName(sql, ctx, ctx.employeeId, name);
        return sendJson(res, 200, { employee });
      }
      const employee = await updateEmployee(sql, ctx, req.body ?? {});
      return sendJson(res, 200, { employee });
    }

    if (req.method === 'DELETE') {
      const result = await deleteEmployee(sql, ctx, req.body ?? {});
      return sendJson(res, 200, result);
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
