import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { createImport, deleteImport, listImports, updateImportOutcome } from '../_lib/data.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * GET    /api/imports                — org-scoped import history (any role,
 *                                       read-only for EMPLOYEE — same
 *                                       broad-read/ADMIN-write convention as
 *                                       /api/areas). Supports ?areaId=,
 *                                       ?page=, ?pageSize=, ?userId=,
 *                                       ?importMode=, ?scopeType=,
 *                                       ?sourceFormat=, ?status=.
 * POST   /api/imports                — register an import outcome;
 *                                       optional areaId makes it area-scoped
 *                                       (validated against the session org).
 * DELETE /api/imports  { id }        — delete exactly one import (ADMIN):
 *                                       hard-deletes only the shifts it
 *                                       created (by import_id), soft-deletes
 *                                       the import row. See deleteImport in
 *                                       _lib/data.js for the full contract.
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));

    if (req.method === 'GET') {
      const result = await listImports(sql, ctx, {
        areaId: String(req.query?.areaId ?? '').trim() || null,
        page: Number(req.query?.page) || 1,
        pageSize: Number(req.query?.pageSize) || 5,
        userId: String(req.query?.userId ?? '').trim() || null,
        importMode: String(req.query?.importMode ?? '').trim() || null,
        scopeType: String(req.query?.scopeType ?? '').trim() || null,
        sourceFormat: String(req.query?.sourceFormat ?? '').trim() || null,
        status: String(req.query?.status ?? '').trim() || null,
      });
      return sendJson(res, 200, result);
    }

    if (req.method === 'POST') {
      const payload = req.body ?? {};
      const outcomeStatus = String(payload.outcome?.status ?? 'completed').trim().toLowerCase();
      const employeeRequired = outcomeStatus === 'completed' || outcomeStatus === 'partial' || outcomeStatus === 'pending';
      if ((employeeRequired && !String(payload.employeeId ?? '').trim())
        || !/^[0-9a-f]{64}$/i.test(String(payload.fileFingerprint ?? '').trim())) {
        return sendJson(res, 400, { error: 'A SHA-256 fileFingerprint is required; this outcome also requires employeeId' });
      }
      const created = await createImport(sql, ctx, payload);
      return sendJson(res, created.deduplicated ? 200 : 201, { import: created });
    }

    if (req.method === 'DELETE') {
      const result = await deleteImport(sql, ctx, req.body?.id);
      return sendJson(res, 200, result);
    }

    if (req.method === 'PATCH') {
      const payload = req.body ?? {};
      const updated = await updateImportOutcome(sql, ctx, payload.id, payload.outcome ?? payload);
      return sendJson(res, 200, { import: updated });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
