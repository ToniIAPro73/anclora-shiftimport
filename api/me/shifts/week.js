import { getSql, requireOrgContext, resolveContext } from '../../_lib/auth.js';
import { listWeekShifts } from '../../_lib/data.js';
import { handleError, sendJson } from '../../_lib/http.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isMonday(value) {
  if (!ISO_DATE_RE.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(date.getTime())
    && date.toISOString().slice(0, 10) === value
    && date.getUTCDay() === 1;
}

/** GET /api/me/shifts/week?week_start=YYYY-MM-DD — SELF-scoped week. */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const weekStart = String(req.query?.week_start ?? '').trim();
    if (!isMonday(weekStart)) {
      return sendJson(res, 400, { error: 'week_start must be a valid Monday (YYYY-MM-DD)' });
    }

    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    const shifts = await listWeekShifts(sql, ctx, weekStart);
    const start = new Date(`${weekStart}T00:00:00Z`);
    const days = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + offset);
      const dateIso = date.toISOString().slice(0, 10);
      return { date: dateIso, shifts: shifts.filter((shift) => shift.date === dateIso) };
    });
    return sendJson(res, 200, { weekStart, days });
  } catch (error) {
    return handleError(res, error);
  }
}
