/**
 * TYPE_MULTI profile: multi-month grid, one repeated monthly table per
 * section (`September 2026`, `October 2026`, ...) on the same page/document.
 * Cells use declarative shift codes (M/T/N/L) resolved via the generic
 * shift-code profile.
 *
 * The generic single-pass engine (parseShiftsFromItems) assumes one
 * calendar context per document, so this profile is parsed by the bespoke
 * section-aware walker (src/ingestion/parsers/multi-section.ts) instead —
 * it detects every month section and returns shifts spanning all of them
 * for the requested employee, reusing the same row/column primitives
 * band-restricted to each section's y-range.
 */
import { IngestionProfile } from './types';

export const TYPE_MULTI_PROFILE: IngestionProfile = {
  id: 'TYPE_MULTI',
  detection: {
    itemPatterns: [/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/],
    normalizedIncludes: [],
  },
  calendarContext: {
    mode: 'month-name-scan',
    monthNames: [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
    ],
    monthShortNames: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
  },
  dayHeader: { pattern: /^(\d{1,2})$/, dayGroup: 1 },
  rowWindow: {
    markerMaxX: 130,
    nameMatching: true,
    dataMinX: 140,
    // See legend.ts: two-line employee block, anchor to this employee's own
    // name y rather than scanning for the previous employee's label.
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
    employeeNotFound: 'No se encontró la fila de {name} ({id}) en ninguna de las secciones mensuales del documento.',
    noDayHeaders: 'No se pudieron detectar las secciones mensuales del documento.',
  },
};
