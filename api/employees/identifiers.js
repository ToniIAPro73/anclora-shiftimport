import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { createSourceIdentifierMapping, resolveBySourceIdentifier } from '../_lib/employee-identifiers.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * GET  /api/employees/identifiers?sourceSystem=&externalIdentifier= — which employee (if any) a source number maps to.
 * POST /api/employees/identifiers — { employeeId, sourceSystem, externalIdentifier } explicit association (ADMIN+).
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    if (req.method === 'GET') {
      return sendJson(res, 200, await resolveBySourceIdentifier(sql, ctx, {
        sourceSystem: req.query?.sourceSystem, externalIdentifier: req.query?.externalIdentifier,
      }));
    }
    if (req.method === 'POST') return sendJson(res, 201, await createSourceIdentifierMapping(sql, ctx, req.body ?? {}));
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
