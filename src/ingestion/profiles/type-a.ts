/**
 * TYPE_A profile: monthly grid calendar.
 *
 * Layout: `dd/mm` day headers across the top, one horizontal strip per
 * employee (name + parenthesized id in the left marker column, shift cells
 * aligned under the day columns at the same y as the markers).
 *
 * Off-token aliases (`off` by default; company tokens like dl/aj when
 * SHIFT_TYPE_PRESET_EXAMPLE is loaded) resolve via the shift-type registry.
 */
import { IngestionProfile } from './types';

export const TYPE_A_PROFILE: IngestionProfile = {
  id: 'TYPE_A',
  detection: {
    itemPatterns: [/^\d{2}\/\d{2}$/, /^\(\d+\)$/],
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
    employeeNotFound: 'No se encontro la fila de {name} ({id}) en el PDF.',
    noDayHeaders: 'No se pudieron detectar los encabezados de dias en la pagina del PDF.',
    noColumnGroups: 'No se pudieron detectar columnas de dias en el PDF.',
    noMappedColumns: 'No se pudieron alinear las columnas de turnos con los dias del PDF.',
  },
};
