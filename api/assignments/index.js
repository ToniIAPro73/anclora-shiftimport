import { getSql, requireOrgContext, requireRole, resolveContext } from '../_lib/auth.js';
import {
  createOrUpdateOperationalAssignment,
  listOperationalAssignments,
  removeOperationalAssignment,
} from '../_lib/data.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * Operational Assignments API (P5.7)
 *
 * GET    /api/assignments?type=X&subjectId=Y&targetId=Z — list active assignments
 * POST   /api/assignments — create or transition assignment with effective dating
 * DELETE /api/assignments — close/remove an assignment
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));

    if (req.method === 'GET') {
      const assignmentType = String(req.query?.type ?? req.query?.assignmentType ?? '').trim() || null;
      const subjectId = String(req.query?.subjectId ?? '').trim() || null;
      const targetId = String(req.query?.targetId ?? '').trim() || null;

      const assignments = await listOperationalAssignments(sql, ctx, {
        assignmentType,
        subjectId,
        targetId,
      });
      return sendJson(res, 200, { assignments });
    }

    requireRole(ctx, 'ADMIN');

    if (req.method === 'POST') {
      const assignment = await createOrUpdateOperationalAssignment(sql, ctx, req.body ?? {});
      return sendJson(res, 201, { assignment });
    }

    if (req.method === 'DELETE') {
      const result = await removeOperationalAssignment(sql, ctx, req.body ?? {});
      return sendJson(res, 200, result);
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
