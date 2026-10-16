export interface CalendarImportContext {
  month: number;
  year: number;
}

export type ImportPeriod =
  | { kind: 'single'; month: number; year: number }
  | { kind: 'multi'; periods: CalendarImportContext[] };

export type PdfDocumentType = 'TYPE_A' | 'TYPE_B' | 'TYPE_TAB' | 'TYPE_LEGEND' | 'TYPE_MULTI' | 'UNKNOWN';

/** Informational day annotation carried by a source (never a shift type, never an hours decision). */
export interface ImportAnnotation {
  kind: 'DCF' | 'COMMENT';
  /** COMMENT text. */
  text?: string;
  /** DCF interval when the source states it; absent = HOURS_UNKNOWN (never invented). */
  startTime?: string | null;
  endTime?: string | null;
}

export interface ParsedCalendarShift {
  date: string;
  startTime: string;
  endTime: string;
  origin?: 'MAN' | 'IMP';
  /** Source file format when the shift came from an import (pdf, csv, ...). */
  sourceFormat?: string;
  isValid: boolean;
  confidence: number;
  rawText: string;
  shiftType?: string | null;
  notes?: string | null;
  color?: string | null;
  annotations?: ImportAnnotation[];
}
