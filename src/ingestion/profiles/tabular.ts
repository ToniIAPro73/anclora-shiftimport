/**
 * TYPE_TAB profile: tabular documents (CSV, plain text, Excel exports).
 *
 * Same monthly-grid semantics as TYPE_A but without the parenthesized id
 * requirement: tabular files often carry the employee name in the marker
 * column and plain day/month headers (`dd/mm`) across the top. Detection
 * only needs the day headers to be present.
 *
 * Registered AFTER TYPE_A/TYPE_B so real company PDFs (which also contain
 * day headers) keep winning with their stricter rules.
 */
import { IngestionProfile } from './types';

export const TYPE_TAB_PROFILE: IngestionProfile = {
  id: 'TYPE_TAB',
  detection: {
    itemPatterns: [/^\d{2}\/\d{2}$/],
    normalizedIncludes: [],
  },
  calendarContext: { mode: 'day-header-month-vote' },
  dayHeader: { pattern: /^(\d{2})\/(\d{2})$/, dayGroup: 1, monthGroup: 2 },
  rowWindow: {
    markerMaxX: 80,
    nameMatching: true,
    dataMinX: 80,
    ceiling: { mode: 'previous-employee-label' },
    floor: { mode: 'offset', offset: -0.5 },
    categoryHints: [],
    defaultCategory: 'Regular',
  },
  clusterTolerance: 8,
  columnMatchMaxDistance: 12,
  validateDayInMonth: true,
  sortResult: true,
  dropIncompleteShifts: true,
  errors: {
    employeeNotFound: 'No se encontro la fila de {name} ({id}) en el documento.',
    noDayHeaders: 'No se pudieron detectar los encabezados de dias en el documento.',
    noColumnGroups: 'No se pudieron detectar columnas de dias en el documento.',
    noMappedColumns: 'No se pudieron alinear las columnas de turnos con los dias del documento.',
  },
};