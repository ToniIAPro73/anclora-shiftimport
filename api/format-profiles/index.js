import { getSql, requireOrgContext, requireRole, resolveContext } from '../_lib/auth.js';
import { handleError, sendJson } from '../_lib/http.js';
import {
  confirmFormatProfile,
  createCandidateFormatProfile,
  deprecateFormatProfile,
  getFormatProfile,
  listFormatProfiles,
  reactivateFormatProfile,
  recordFormatProfileUse,
  renameFormatProfile,
} from '../_lib/format-profiles.js';

/**
 * Organization Format Profiles (Format Memory v1).
 *
 * GET   /api/format-profiles              — list (any role). Query:
 *                                            ?logicalProfileId=&status=
 * GET   /api/format-profiles?id=X          — full record for one profile (any role)
 * POST  /api/format-profiles               — create candidate (any role, "teaching"
 *                                            is not admin-gated)
 * PATCH /api/format-profiles               — body.id + body.action selects the
 *                                            mutation (ADMIN, except "use"):
 *                                              action: "rename"      -> body.displayName, body.updatedAt
 *                                              action: "confirm"     -> body.updatedAt
 *                                              action: "deprecate"   -> body.updatedAt
 *                                              action: "reactivate"  -> body.updatedAt
 *                                              action: "use"         -> body.outcome ("success"|"failure")
 *
 * Tenant isolation: organization_id always comes from the session context;
 * an id from another organization is a 404 (no leak). See
 * sdd/features/format-memory-v1/02_DATA_API_CONTRACT.md.
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));

    if (req.method === 'GET') {
      const id = typeof req.query?.id === 'string' ? req.query.id : null;
      if (id) {
        const profile = await getFormatProfile(sql, ctx, id);
        return sendJson(res, 200, { profile });
      }
      const logicalProfileId = typeof req.query?.logicalProfileId === 'string' ? req.query.logicalProfileId : null;
      const status = typeof req.query?.status === 'string' ? req.query.status : null;
      const profiles = await listFormatProfiles(sql, ctx, { logicalProfileId, status });
      return sendJson(res, 200, { profiles });
    }

    if (req.method === 'POST') {
      const { profile, created } = await createCandidateFormatProfile(sql, ctx, req.body ?? {});
      return sendJson(res, created ? 201 : 200, { profile });
    }

    if (req.method === 'PATCH') {
      const id = String(req.body?.id ?? '').trim();
      if (!id) {
        return sendJson(res, 400, { error: 'Format profile id is required' });
      }
      const action = req.body?.action;

      if (action === 'use') {
        const profile = await recordFormatProfileUse(sql, ctx, id, req.body?.outcome);
        return sendJson(res, 200, { profile });
      }

      requireRole(ctx, 'ADMIN');
      const updatedAt = req.body?.updatedAt;
      // Validated here (not left to the SQL cast) so a malformed value is a
      // clean 400, never a raw Postgres cast error surfacing as a 500.
      if (!updatedAt || Number.isNaN(new Date(updatedAt).getTime())) {
        return sendJson(res, 400, { error: 'A valid updatedAt is required for this action' });
      }

      if (action === 'rename') {
        const profile = await renameFormatProfile(sql, ctx, id, req.body?.displayName, updatedAt);
        return sendJson(res, 200, { profile });
      }
      if (action === 'confirm') {
        const profile = await confirmFormatProfile(sql, ctx, id, updatedAt);
        return sendJson(res, 200, { profile });
      }
      if (action === 'deprecate') {
        const profile = await deprecateFormatProfile(sql, ctx, id, updatedAt);
        return sendJson(res, 200, { profile });
      }
      if (action === 'reactivate') {
        const profile = await reactivateFormatProfile(sql, ctx, id, updatedAt);
        return sendJson(res, 200, { profile });
      }
      return sendJson(res, 400, { error: 'Unknown action' });
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
