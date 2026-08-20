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
  // Weekday-initial + day-number header. NOT restricted to the Spanish
  // L-M-X-J-V-S-D alphabet: some documents print English (S/M/T/W/T/F/S)
  // or other-locale initials. The day NUMBER is the reliable signal; the
  // 1-2 letter prefix is accepted generically instead of enumerated, so any
  // locale's weekday abbreviation resolves the same way.
  dayHeader: { pattern: /^[A-Za-zÀ-ÖØ-öø-ÿ]{1,2}(\d{1,2})$/, dayGroup: 1 },
  // One employee's month can be split across pages, one page per fortnight
  // (e.g. "01-15 Aug" / "16-31 Aug" as separate page blocks, each with its
  // own repeated day-header row and its own copy of every employee's row).
  multiPageEmployee: true,
  rowWindow: {
    markerMaxX: 100,
    // Names locate the row too: they print on the id marker's line, a few
    // points right of markerMaxX in dense layouts (row-detection extends the
    // name zone to dataMinX for lines anchored by an id marker).
    nameMatching: true,
    dataMinX: 150,
    ceiling: { mode: 'offset', offset: 12, inclusive: true },
    floor: {
      mode: 'next-row-boundary',
      // padY must clear the next employee's start-time line: split-line
      // blocks print start times ~5pt above the row's own id marker, so a
      // smaller pad lets the neighbour's starts bleed into this row and
      // produces phantom `??:??` second segments.
      scan: { idPattern: /^\d{4,6}$/, tokens: ['supervisor', 'sup aea'], padY: 6, fallback: -1000 },
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
