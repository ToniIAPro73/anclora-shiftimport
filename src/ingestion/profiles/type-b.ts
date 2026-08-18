/**
 * TYPE_B profile: weekly-band calendar with company sections.
 *
 * Layout: weekday headers (`L5`, `M6`, ... `D7`) per week band, a `nomina`
 * header, plain-number employee ids in the left marker column. One employee
 * spans a vertical band covering all week rows, bounded below by the next
 * employee id or a section header (`supervisor`, `sup aea`). Section labels
 * (`jtu`, `supervisor`, `sup aea`) also classify the employee's category.
 *
 * Off-token aliases (`off` by default; company tokens like dl/aj when
 * SHIFT_TYPE_PRESET_EXAMPLE is loaded) resolve via the shift-type registry.
 */
import { IngestionProfile } from './types';

export const TYPE_B_PROFILE: IngestionProfile = {
  id: 'TYPE_B',
  detection: {
    itemPatterns: [/^[LMXJVSD]\d{1,2}$/],
    normalizedIncludes: ['nomina'],
  },
  calendarContext: {
    mode: 'month-name-scan',
    monthNames: [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ],
    monthShortNames: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  },
  dayHeader: { pattern: /^[LMXJVSD](\d{1,2})$/, dayGroup: 1 },
  rowWindow: {
    markerMaxX: 100,
    nameMatching: false,
    dataMinX: 150,
    ceiling: { mode: 'offset', offset: 12, inclusive: true },
    floor: {
      mode: 'next-row-boundary',
      scan: { idPattern: /^\d{4,6}$/, tokens: ['supervisor', 'sup aea'], padY: 2, fallback: -1000 },
    },
    categoryHints: [
      { tokens: ['jtu'], category: 'Jefe de Turno' },
      { tokens: ['supervisor', 'sup aea'], category: 'Regular' },
    ],
    defaultCategory: 'Regular',
  },
  clusterTolerance: 8,
  columnMatchMaxDistance: 12,
  validateDayInMonth: false,
  sortResult: false,
  dropIncompleteShifts: false,
  errors: {
    employeeNotFound: 'No se encontró la fila de {name} ({id}) en el PDF.',
    noDayHeaders: 'No se pudieron detectar los encabezados de días en la página del PDF (Tipo B).',
  },
};
