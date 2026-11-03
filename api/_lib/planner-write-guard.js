/**
 * F4-M03 / OD-F4-03: a PLANNER plans in drafts and may register history; it never edits the CURRENT or FUTURE operational calendar
 * directly. `can(EDIT_SHIFT)` stays as it is (planning, history and reconciliation legitimately need it): the restriction lives at the
 * boundary of each operation that writes `shifts`, so a hidden button is never the only control.
 *
 * "Today" is the product's operational date (Europe/Madrid, `getOperationalDate`) and is INSIDE the prohibition: only dates strictly
 * before it are history. Imports are a different, separately authorised path (IMPORT_TEAM); they are recognised by an import record
 * the actor created, never by a client-declared string.
 */
import { HttpError } from './auth.js';
import { getOperationalDate, isHistoricalDate } from './operational-date.js';

export const PLANNER_DIRECT_WRITE_FORBIDDEN = 'PLANNER_DIRECT_WRITE_FORBIDDEN';

function forbidden() {
  const error = new HttpError(403, 'Planners plan in drafts: the current and future operational calendar cannot be changed directly');
  error.code = PLANNER_DIRECT_WRITE_FORBIDDEN;
  return error;
}

/** Throws for a PLANNER writing an operational row dated today or later; any other role (or a past date) passes untouched. */
export function assertPlannerOperationalDate(ctx, date, today = getOperationalDate()) {
  if (ctx?.role !== 'PLANNER') return;
  if (!isHistoricalDate(String(date ?? ''), today)) throw forbidden();
}

/**
 * A PLANNER may write current/future rows only as part of an import it started. The id must be a real import of this organisation
 * recorded for THIS user: a made-up id (or someone else's) is the same bypass as sending no id.
 */
export async function assertPlannerImportAttribution(sql, ctx, importId) {
  if (ctx?.role !== 'PLANNER') return;
  const id = String(importId ?? '').trim();
  if (!id) throw forbidden();
  const rows = await sql`
    SELECT 1 AS found FROM imports
    WHERE id = ${id} AND organization_id = ${ctx.organizationId} AND imported_by_user_id = ${ctx.user.id}
    LIMIT 1
  `;
  if (rows.length === 0) throw forbidden();
}
