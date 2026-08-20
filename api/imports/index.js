import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { createImport, listImports } from '../_lib/data.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * GET  /api/imports — org-scoped import history.
 * POST /api/imports — register a completed import document.
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));

    if (req.method === 'GET') {
      return sendJson(res, 200, { imports: await listImports(sql, ctx) });
    }

    if (req.method === 'POST') {
      const created = await createImport(sql, ctx, req.body ?? {});
      return sendJson(res, 201, { import: created });
    }

    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
