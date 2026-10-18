/**
 * Business class of an import source. The single place that decides what a document IS for ShiftImport:
 *
 * - TEAM_PLANNING: a multi-employee schedule (Cuadrante de empresa). Past dates are calendar evidence, future dates
 *   feed Planificación as DRAFT and are never published by the import.
 * - EMPLOYEE_CALENDAR_SNAPSHOT: an individual calendar (Mensual publicado / Calendario del empleado). Both are
 *   snapshots of the same employee calendar; the second may carry more information (DCF, incidences, observations).
 *   They are compared with the CURRENT calendar and never become a company plan revision.
 *
 * Internal vocabulary only; the user-facing names live in i18n.
 */
export const SOURCE_BUSINESS_CLASS = Object.freeze({
  TEAM_PLANNING: 'TEAM_PLANNING',
  EMPLOYEE_CALENDAR_SNAPSHOT: 'EMPLOYEE_CALENDAR_SNAPSHOT',
});

const CALENDAR_SNAPSHOT_KINDS = new Set(['EMPLOYEE_CALENDAR_EXPORT', 'PUBLISHED_CALENDAR_EXPORT']);

/** UNKNOWN sources keep the legacy behaviour (planning), so nothing silently changes for unclassified documents. */
export const getSourceBusinessClass = (sourceKind) =>
  CALENDAR_SNAPSHOT_KINDS.has(sourceKind) ? SOURCE_BUSINESS_CLASS.EMPLOYEE_CALENDAR_SNAPSHOT : SOURCE_BUSINESS_CLASS.TEAM_PLANNING;

export const isCalendarSnapshotSource = (sourceKind) => getSourceBusinessClass(sourceKind) === SOURCE_BUSINESS_CLASS.EMPLOYEE_CALENDAR_SNAPSHOT;
