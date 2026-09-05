import { getSql, requireOrgContext, resolveContext } from '../../_lib/auth.js';
import { requireApprovalAdmin } from '../../_lib/approval.js';
import { handleError, sendJson } from '../../_lib/http.js';

function mapResponsible(row) {
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
  };
}

async function assertArea(sql, ctx, areaId) {
  const rows = await sql`
    SELECT id FROM areas
    WHERE id = ${areaId} AND organization_id = ${ctx.organizationId}
  `;
  return rows.length > 0;
}

/** Area responsible mapping. All operations require OWNER/ADMIN and remain
 * scoped to the active organization; a user must be an ADMIN member of it. */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    requireApprovalAdmin(ctx, 'GET/POST/DELETE /api/areas/:id/responsibles');
    const areaId = String(req.query?.id ?? '').trim();
    if (!areaId || !(await assertArea(sql, ctx, areaId))) {
      return sendJson(res, 404, { error: 'Area not found' });
    }

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT ar.user_id, u.email, u.display_name
        FROM area_responsibles ar
        JOIN users u ON u.id = ar.user_id
        WHERE ar.area_id = ${areaId}
          AND ar.organization_id = ${ctx.organizationId}
        ORDER BY lower(u.email) ASC
      `;
      return sendJson(res, 200, { responsibles: rows.map(mapResponsible) });
    }

    const userId = String(req.body?.userId ?? req.query?.userId ?? '').trim();
    if (!userId) {
      return sendJson(res, 400, { error: 'userId is required' });
    }

    const memberRows = await sql`
      SELECT m.user_id, u.email, u.display_name
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = ${ctx.organizationId}
        AND m.user_id = ${userId}
        AND m.role = 'ADMIN'
    `;
    if (memberRows.length === 0) {
      return sendJson(res, 404, { error: 'Eligible organization admin not found' });
    }

    if (req.method === 'POST') {
      try {
        await sql`
          INSERT INTO area_responsibles (area_id, user_id, organization_id)
          VALUES (${areaId}, ${userId}, ${ctx.organizationId})
        `;
      } catch (error) {
        if (error?.code === '23505') {
          return sendJson(res, 409, { error: 'This admin is already an area responsible' });
        }
        throw error;
      }
      return sendJson(res, 201, { responsible: mapResponsible(memberRows[0]) });
    }

    if (req.method === 'DELETE') {
      const rows = await sql`
        DELETE FROM area_responsibles
        WHERE area_id = ${areaId}
          AND user_id = ${userId}
          AND organization_id = ${ctx.organizationId}
        RETURNING user_id
      `;
      if (rows.length === 0) {
        return sendJson(res, 404, { error: 'Area responsible not found' });
      }
      return sendJson(res, 200, { removed: true, userId });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
