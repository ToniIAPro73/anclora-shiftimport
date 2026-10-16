import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { listAnnotations, saveImportedAnnotations, setDcfInterval } from '../_lib/annotations.js';
import { handleError, sendJson } from '../_lib/http.js';

/**
 * GET   /api/calendar/annotations?employeeId=&from=&to=  — DCF incidences and observations of a range.
 * POST  /api/calendar/annotations — { employeeId, importId?, sourceKind?, items:[{date,kind,text?,startTime?,endTime?}] }
 *       persists annotations that came with an imported calendar (EMPLOYEE: own calendar only).
 * PATCH /api/calendar/annotations — { employeeId, date, startTime, endTime } completes a DCF interval
 *       (OWNER / ADMIN / PLANNER within scope; both times null = back to HOURS_UNKNOWN).
 */
export default async function handler(req, res) {
  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    if (req.method === 'GET') {
      return sendJson(res, 200, await listAnnotations(sql, ctx, {
        employeeId: String(req.query?.employeeId ?? '').trim(),
        from: String(req.query?.from ?? ''),
        to: String(req.query?.to ?? ''),
      }));
    }
    if (req.method === 'POST') return sendJson(res, 201, await saveImportedAnnotations(sql, ctx, req.body ?? {}));
    if (req.method === 'PATCH') return sendJson(res, 200, await setDcfInterval(sql, ctx, req.body ?? {}));
    res.setHeader('Allow', 'GET, POST, PATCH');
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return handleError(res, error);
  }
}
