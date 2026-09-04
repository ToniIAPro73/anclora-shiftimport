import { getSql, requireOrgContext, resolveContext } from '../../../../../_lib/auth.js';
import { deleteAssignment, updateAssignment } from '../../../../../_lib/scheduling.js';
import { handleError, sendJson } from '../../../../../_lib/http.js';

export default async function handler(req, res) {
  try {
    if (!['PATCH', 'DELETE'].includes(req.method)) {
      res.setHeader('Allow', 'PATCH, DELETE');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const scheduleId = String(req.query?.scheduleId ?? '');
    const versionId = String(req.query?.versionId ?? '');
    const assignmentId = String(req.query?.id ?? '');
    if (req.method === 'PATCH') {
      const assignment = await updateAssignment(sql, ctx, scheduleId, versionId, assignmentId, req.body ?? {});
      return sendJson(res, 200, { assignment });
    }
    await deleteAssignment(sql, ctx, scheduleId, versionId, assignmentId);
    return res.status(204).send('');
  } catch (error) {
    return handleError(res, error);
  }
}
