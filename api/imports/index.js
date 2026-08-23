import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { createImport, listImports } from '../_lib/data.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * GET  /api/imports           — org-scoped import history.
 * GET  /api/imports?areaId=X  — history filtered by area (dashboard area
 *                               context; empty result for foreign area ids).
 * POST /api/imports           — register a completed import document; optional
 *                               areaId makes the import area-scoped (validated
 *                               against the session org).
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));

    if (req.method === 'GET') {
      const imports = await listImports(sql, ctx, {
        areaId: String(req.query?.areaId ?? '').trim() || null,
      });
      return sendJson(res, 200, { imports });
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
