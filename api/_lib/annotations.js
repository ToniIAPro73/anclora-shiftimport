import { ledgerPrefix } from './import-ledger.js';
import { HttpError, requireRole } from './auth.js';
import { assertEmployeeInScope } from './data.js';

/**
 * Day annotations that travel with an imported calendar:
 *   DCF     = "Descanso Compensación Formación". Informational incidence: it NEVER alters effective hours
 *             (DCF_ALTERS_EFFECTIVE_HOURS=false until a business contract says otherwise). The source often
 *             states that it exists but not when: completeness HOURS_UNKNOWN, hours never invented.
 *   COMMENT = observation text (never a shift type). Imported comments are origin IMPORT, user-written ones MANUAL.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const MAX_ITEMS = 2000;

function bad(message, code) {
  const error = new HttpError(400, message);
  if (code) error.code = code;
  return error;
}

export const DCF_ALTERS_EFFECTIVE_HOURS = false;

/** Validates and normalises one imported annotation. */
export function normalizeAnnotationInput(raw) {
  const date = String(raw?.date ?? '').slice(0, 10);
  if (!DATE_RE.test(date)) throw bad('Every annotation needs a valid ISO date', 'INVALID_ANNOTATION');
  const kind = raw?.kind === 'DCF' ? 'DCF' : raw?.kind === 'COMMENT' ? 'COMMENT' : null;
  if (!kind) throw bad('Annotation kind must be DCF or COMMENT', 'INVALID_ANNOTATION');
  if (kind === 'COMMENT') {
    const text = String(raw?.text ?? raw?.body ?? '').trim();
    if (!text || text.length > 2000) throw bad('A comment needs 1-2000 characters', 'INVALID_ANNOTATION');
    return { date, kind, body: text, startTime: null, endTime: null, completeness: null };
  }
  const start = raw?.startTime ? String(raw.startTime) : null;
  const end = raw?.endTime ? String(raw.endTime) : null;
  if ((start && !end) || (!start && end)) throw bad('A DCF interval needs both start and end', 'INVALID_ANNOTATION');
  if (start && (!TIME_RE.test(start) || !TIME_RE.test(end))) throw bad('DCF times must be HH:mm', 'INVALID_ANNOTATION');
  return { date, kind, body: null, startTime: start, endTime: end, completeness: start ? 'HOURS_KNOWN' : 'HOURS_UNKNOWN' };
}

const mapRow = (row) => ({
  id: row.id,
  employeeId: row.employee_id,
  date: row.date,
  kind: row.kind,
  text: row.body ?? null,
  startTime: row.start_time ?? null,
  endTime: row.end_time ?? null,
  completeness: row.completeness ?? null,
  origin: row.origin,
  sourceKind: row.source_kind ?? null,
  updatedAt: row.updated_at,
});

export async function listAnnotations(sql, ctx, { employeeId, from, to }) {
  const target = ctx.role === 'EMPLOYEE' ? ctx.employeeId : String(employeeId ?? '').trim();
  if (!target) throw bad('employeeId is required', 'EMPLOYEE_REQUIRED');
  if (!DATE_RE.test(String(from)) || !DATE_RE.test(String(to))) throw bad('from and to must be ISO dates', 'INVALID_RANGE');
  await assertEmployeeInScope(sql, ctx, target);
  const rows = await sql`
    SELECT id, employee_id, TO_CHAR(date, 'YYYY-MM-DD') AS date, kind, body, start_time, end_time, completeness, origin, source_kind, updated_at
    FROM calendar_annotations
    WHERE organization_id = ${ctx.organizationId} AND employee_id = ${target} AND date BETWEEN ${from} AND ${to}
    ORDER BY date ASC, kind ASC, origin ASC
  `;
  return { employeeId: target, annotations: rows.map(mapRow) };
}

/**
 * One transaction-ready upsert statement for an imported annotation. A re-import never downgrades a DCF whose
 * hours were completed by a person (HOURS_KNOWN stays), and never rewrites user-written (MANUAL) rows.
 */
export function importedAnnotationStatement(txn, ctx, { employeeId, importId = null, sourceKind = null }, item) {
  return txn`
    INSERT INTO calendar_annotations (
      organization_id, employee_id, date, kind, body, start_time, end_time, completeness, origin, source_kind, import_id,
      created_by_user_id, updated_by_user_id
    ) VALUES (
      ${ctx.organizationId}, ${employeeId}, ${item.date}, ${item.kind}, ${item.body}, ${item.startTime}, ${item.endTime},
      ${item.completeness}, 'IMPORT', ${sourceKind}, ${importId}, ${ctx.user.id}, ${ctx.user.id}
    )
    ON CONFLICT (organization_id, employee_id, date, kind, origin) DO UPDATE SET
      body = EXCLUDED.body,
      start_time = CASE WHEN calendar_annotations.completeness = 'HOURS_KNOWN' AND EXCLUDED.completeness = 'HOURS_UNKNOWN'
                        THEN calendar_annotations.start_time ELSE EXCLUDED.start_time END,
      end_time = CASE WHEN calendar_annotations.completeness = 'HOURS_KNOWN' AND EXCLUDED.completeness = 'HOURS_UNKNOWN'
                      THEN calendar_annotations.end_time ELSE EXCLUDED.end_time END,
      completeness = CASE WHEN calendar_annotations.completeness = 'HOURS_KNOWN' AND EXCLUDED.completeness = 'HOURS_UNKNOWN'
                          THEN calendar_annotations.completeness ELSE EXCLUDED.completeness END,
      source_kind = EXCLUDED.source_kind,
      import_id = COALESCE(EXCLUDED.import_id, calendar_annotations.import_id),
      updated_by_user_id = EXCLUDED.updated_by_user_id,
      updated_at = NOW()
    RETURNING id
  `;
}

export function normalizeAnnotationItems(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length > MAX_ITEMS) throw bad(`At most ${MAX_ITEMS} annotations per request`, 'TOO_MANY_ANNOTATIONS');
  const seen = new Map();
  for (const raw of list) {
    const item = normalizeAnnotationInput(raw);
    seen.set(`${item.date}|${item.kind}`, item); // one DCF and one imported comment per day
  }
  return [...seen.values()];
}

/** Import-time persistence (own import for EMPLOYEE, anyone in scope otherwise). */
export async function saveImportedAnnotations(sql, ctx, { employeeId, importId = null, sourceKind = null, items }) {
  const target = ctx.role === 'EMPLOYEE' ? ctx.employeeId : String(employeeId ?? '').trim();
  if (!target) throw bad('employeeId is required', 'EMPLOYEE_REQUIRED');
  await assertEmployeeInScope(sql, ctx, target);
  const normalized = normalizeAnnotationItems(items);
  if (normalized.length === 0) return { saved: 0 };
  await sql.transaction((txn) => [
    ...(importId ? ledgerPrefix(txn, ctx.organizationId, importId) : []),
    ...normalized.map((item) => importedAnnotationStatement(txn, ctx, { employeeId: target, importId, sourceKind }, item)),
  ]);
  return { saved: normalized.length };
}

/**
 * Completes (or clears) the interval of a DCF. Planning roles only: an EMPLOYEE can never edit administrative incidences.
 * Hours stay informational: nothing here touches shifts or statistics.
 */
export async function setDcfInterval(sql, ctx, { employeeId, date, startTime, endTime }) {
  requireRole(ctx, 'PLANNER');
  const target = String(employeeId ?? '').trim();
  if (!target) throw bad('employeeId is required', 'EMPLOYEE_REQUIRED');
  await assertEmployeeInScope(sql, ctx, target);
  const item = normalizeAnnotationInput({ date, kind: 'DCF', startTime: startTime || null, endTime: endTime || null });
  const updated = await sql`
    UPDATE calendar_annotations
    SET start_time = ${item.startTime}, end_time = ${item.endTime}, completeness = ${item.completeness},
        updated_by_user_id = ${ctx.user.id}, updated_at = NOW()
    WHERE organization_id = ${ctx.organizationId} AND employee_id = ${target} AND date = ${item.date} AND kind = 'DCF'
    RETURNING id
  `;
  if (updated.length === 0) {
    await sql`
      INSERT INTO calendar_annotations (organization_id, employee_id, date, kind, start_time, end_time, completeness, origin, created_by_user_id, updated_by_user_id)
      VALUES (${ctx.organizationId}, ${target}, ${item.date}, 'DCF', ${item.startTime}, ${item.endTime}, ${item.completeness}, 'MANUAL', ${ctx.user.id}, ${ctx.user.id})
    `;
  }
  return { employeeId: target, date: item.date, completeness: item.completeness, startTime: item.startTime, endTime: item.endTime };
}
