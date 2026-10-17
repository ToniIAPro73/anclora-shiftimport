import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { createSourceIdentifierMapping, resolveBySourceIdentifier, resolveSourceIdentity } from '../_lib/employee-identifiers.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * GET  /api/employees/identifiers?sourceSystem=&externalIdentifier= — which employee (if any) a source number maps to.
 * POST /api/employees/identifiers — { employeeId, sourceSystem, externalIdentifier, documentName? } explicit association
 *   (ADMIN+; an EMPLOYEE may only bind their own record, verified against the document name).
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    if (req.method === 'GET') {
      // With a document name: the full resolution (mapping -> canonical id -> unique exact name) used by the import gate.
      if (req.query?.documentName !== undefined) {
        return sendJson(res, 200, await resolveSourceIdentity(sql, ctx, {
          sourceSystem: req.query?.sourceSystem, externalIdentifier: req.query?.externalIdentifier, documentName: req.query?.documentName,
        }));
      }
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
