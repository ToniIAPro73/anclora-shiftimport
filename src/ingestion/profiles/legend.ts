/**
 * TYPE_LEGEND profile: single-period monthly grid using declarative shift
 * codes (e.g. `M`, `T`, `N`) resolved via the document's own inline legend
 * (`M 07:00-15:00; T 15:00-23:00; ...`) merged with the generic defaults
 * (src/ingestion/core/shift-code-profile.ts). No company code is hardcoded:
 * any document that states its own legend works out of the box.
 *
 * Layout: bare zero-padded day headers (`01`..`31`), employee name on its
 * own line, id + area + shift-code cells on the next line at the marker
 * column.
 */
import { IngestionProfile } from './types';

export const TYPE_LEGEND_PROFILE: IngestionProfile = {
  id: 'TYPE_LEGEND',
  detection: {
    itemPatterns: [/[A-Za-zÁÉÍÓÚÑñáéíóú]{1,3}\s+\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/],
    normalizedIncludes: [],
  },
  calendarContext: {
    mode: 'month-name-scan',
    monthNames: [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ],
    monthShortNames: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  },
  dayHeader: { pattern: /^(\d{2})$/, dayGroup: 1 },
  rowWindow: {
    markerMaxX: 90,
    nameMatching: true,
    dataMinX: 90,
    // Two-line employee block (name row, then id+area+cells row): bounding
    // by the previous employee's *name* leaves their cell row (a few units
    // below their name) inside this employee's band. Anchor to this
    // employee's own name y instead — well short of the ~30pt gap to the
    // next employee, comfortably past the gap to its own cell row.
    ceiling: { mode: 'offset', offset: 15, inclusive: false },
    floor: { mode: 'offset', offset: -0.5 },
    categoryHints: [],
    defaultCategory: 'Regular',
  },
  clusterTolerance: 8,
  columnMatchMaxDistance: 12,
  validateDayInMonth: false,
  sortResult: true,
  dropIncompleteShifts: true,
  useShiftCodeProfile: true,
  errors: {
    employeeNotFound: 'No se encontró la fila de {name} ({id}) en el documento.',
    noDayHeaders: 'No se pudieron detectar los encabezados de días en el documento (leyenda de códigos).',
    noColumnGroups: 'No se pudieron detectar columnas de días en el documento.',
    noMappedColumns: 'No se pudieron alinear las columnas de turnos con los días del documento.',
  },
};
