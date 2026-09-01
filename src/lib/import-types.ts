export interface CalendarImportContext {
  month: number;
  year: number;
}

export type ImportPeriod =
  | { kind: 'single'; month: number; year: number }
  | { kind: 'multi'; periods: CalendarImportContext[] };

export type PdfDocumentType = 'TYPE_A' | 'TYPE_B' | 'TYPE_TAB' | 'TYPE_LEGEND' | 'TYPE_MULTI' | 'UNKNOWN';

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
}
