import { getSql, requireOrgContext, resolveContext } from '../../_lib/auth.js';
import { listEmployeeNotifications } from '../../_lib/data.js';
import { handleError, sendJson } from '../../_lib/http.js';

/** GET /api/me/notifications — the authenticated employee's notifications. */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const notifications = await listEmployeeNotifications(sql, ctx);
    return sendJson(res, 200, {
      notifications,
      unreadCount: notifications.filter((notification) => !notification.readAt).length,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
