/**
 * Declarative ingestion profile: every heuristic the generic core needs to
 * parse one PDF schedule family. All thresholds, tokens and patterns were
 * extracted from the legacy parser code, not designed from a schema.
 */
import { PdfDocumentType } from '../../lib/import-types';
import { CalendarContextRule } from '../core/calendar-context';
import { DayHeaderRule } from '../core/day-columns';
import { RowWindowRules } from '../core/row-detection';

export interface DetectionRule {
  /** Each pattern must match at least one item text. */
  itemPatterns: RegExp[];
  /** Each token must appear in at least one normalized item text. */
  normalizedIncludes: string[];
}

export interface IngestionProfile {
  id: Exclude<PdfDocumentType, 'UNKNOWN'>;
  detection: DetectionRule;
  calendarContext: CalendarContextRule;
  dayHeader: DayHeaderRule;
  rowWindow: RowWindowRules;
  /** clusterByX tolerance. */
  clusterTolerance: number;
  /** mapColumnGroupsToDays maximum alignment distance. */
  columnMatchMaxDistance: number;
  /** Drop mapped days outside the context month length. */
  validateDayInMonth: boolean;
  /** Sort the result by date and start time. */
  sortResult: boolean;
  /** Drop incomplete shifts with no type and `??:??` times. */
  dropIncompleteShifts: boolean;
  errors: {
    /** Supports `{name}` and `{id}` placeholders. */
    employeeNotFound: string;
    noDayHeaders: string;
    /** When set, an empty cluster list throws. */
    noColumnGroups?: string;
    /** When set, an empty column→day mapping throws. */
    noMappedColumns?: string;
  };
}
