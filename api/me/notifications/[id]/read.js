import { getSql, requireOrgContext, resolveContext } from '../../../_lib/auth.js';
import { markEmployeeNotificationRead } from '../../../_lib/data.js';
import { handleError, sendJson } from '../../../_lib/http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /api/me/notifications/:id/read — idempotently marks one own item read. */
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const notificationId = String(req.query?.id ?? '').trim();
    if (!UUID_RE.test(notificationId)) {
      return sendJson(res, 404, { error: 'Notification not found' });
    }

    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const notification = await markEmployeeNotificationRead(sql, ctx, notificationId);
    return sendJson(res, 200, { notification });
  } catch (error) {
    return handleError(res, error);
  }
}
