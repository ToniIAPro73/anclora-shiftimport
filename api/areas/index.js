import { getSql, requireOrgContext, requireRole, resolveContext } from '../_lib/auth.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * Organization Areas (optional, 0..N per org).
 *
 * GET   /api/areas — org-scoped list, any role (EMPLOYEE needs read access to
 *                    resolve its own area context on the dashboard).
 * POST  /api/areas — create (ADMIN). Name unique per org (normalized);
 *                    code optional, unique per org when present.
 * PATCH /api/areas — rename / change code / deactivate (ADMIN). No hard
 *                    DELETE: historical shifts/imports keep referencing the
 *                    area snapshot, so removal is always active=false.
 *
 * Tenant isolation: organization_id always comes from the session context;
 * an id from another organization is a 404 'Area not found' (no leak).
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, name, code, active, created_at
        FROM areas
        WHERE organization_id = ${ctx.organizationId}
        ORDER BY name ASC
      `;
      return sendJson(res, 200, {
        areas: rows.map((row) => ({
          id: row.id,
          name: row.name,
          code: row.code,
          active: row.active,
          createdAt: row.created_at,
        })),
      });
    }

    requireRole(ctx, 'ADMIN');

    if (req.method === 'POST') {
      const name = String(req.body?.name ?? '').trim();
      if (!name) {
        return sendJson(res, 400, { error: 'Area name is required' });
      }
      const code = String(req.body?.code ?? '').trim() || null;

      // Normalized uniqueness is enforced by the partial unique indexes
      // (areas_org_name_idx / areas_org_code_idx); a violation surfaces as a
      // 23505 and becomes a 409 below — never a silent duplicate.
      try {
        const rows = await sql`
          INSERT INTO areas (organization_id, name, code)
          VALUES (${ctx.organizationId}, ${name}, ${code})
          RETURNING id, name, code, active, created_at
        `;
        const row = rows[0];
        return sendJson(res, 201, {
          area: { id: row.id, name: row.name, code: row.code, active: row.active, createdAt: row.created_at },
        });
      } catch (error) {
        if (error?.code === '23505') {
          return sendJson(res, 409, { error: 'An area with this name or code already exists' });
        }
        throw error;
      }
    }

    if (req.method === 'PATCH') {
      const id = String(req.body?.id ?? '').trim();
      if (!id) {
        return sendJson(res, 400, { error: 'Area id is required' });
      }
      const existing = await sql`
        SELECT id, name, code, active FROM areas
        WHERE id = ${id} AND organization_id = ${ctx.organizationId}
      `;
      if (existing.length === 0) {
        return sendJson(res, 404, { error: 'Area not found' });
      }

      const deactivate = req.body?.deactivate === true;
      if (deactivate) {
        const rows = await sql`
          UPDATE areas SET active = FALSE, updated_at = NOW()
          WHERE id = ${id} AND organization_id = ${ctx.organizationId}
          RETURNING id, name, code, active, created_at
        `;
        const row = rows[0];
        return sendJson(res, 200, {
          area: { id: row.id, name: row.name, code: row.code, active: row.active, createdAt: row.created_at },
        });
      }

      const current = existing[0];
      const name = req.body?.name !== undefined ? String(req.body.name).trim() : current.name;
      if (!name) {
        return sendJson(res, 400, { error: 'Area name is required' });
      }
      const code = req.body?.code !== undefined ? String(req.body.code).trim() || null : current.code;
      try {
        const rows = await sql`
          UPDATE areas SET name = ${name}, code = ${code}, updated_at = NOW()
          WHERE id = ${id} AND organization_id = ${ctx.organizationId}
          RETURNING id, name, code, active, created_at
        `;
        const row = rows[0];
        return sendJson(res, 200, {
          area: { id: row.id, name: row.name, code: row.code, active: row.active, createdAt: row.created_at },
        });
      } catch (error) {
        if (error?.code === '23505') {
          return sendJson(res, 409, { error: 'An area with this name or code already exists' });
        }
        throw error;
      }
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
