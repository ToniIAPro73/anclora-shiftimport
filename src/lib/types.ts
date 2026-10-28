import type { ImportAnnotation } from './import-types';
export type ShiftCategory = 'Mañana' | 'Tarde' | 'Noche';

/**
 * How the shift entered the app (what the user did), NOT the file format.
 * 'PDF' from legacy persisted data is normalized to 'IMP' on load.
 */
export type ShiftOrigin = 'MAN' | 'IMP';

/** Source file format of an imported shift (undefined for manual entries). */
export type ShiftSourceFormat = 'pdf' | 'png' | 'jpg' | 'jpeg' | 'webp' | 'csv' | 'xlsx' | 'xls' | 'text' | string;

export interface Shift {
  id: string;
  date: string; // ISO YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  /** Effective configured type; legacy rows may omit it and use location. */
  shiftType?: string | null;
  /** Persisted semantic snapshot when the backend has it. */
  countsAsWork?: boolean | null;
  location: string;
  origin: ShiftOrigin;
  sourceFormat?: ShiftSourceFormat;
  employeeId?: string;
  acknowledgementStatus?: 'PENDING' | 'ACKNOWLEDGED';
  acknowledgedAt?: string | null;
  /** Legacy storage metadata; it never selects CURRENT. */
  layer?: 'COMPANY_PLAN' | 'CHANGE';
  provenance?: string | null;
  /** Transient API intent: elevated users explicitly confirmed adding this timed shift beside a full-day record. */
  confirmWholeDayOverride?: boolean;
  dutyRole?: string | null;
  effectiveState?: 'EFFECTIVE' | 'SUPERSEDED' | 'ABSORBED' | 'METADATA_ONLY' | 'REQUIRES_REVIEW';
  planRevision?: number;
  changeId?: string | null;
  createdAt?: string | null;
  importId?: string | null;
  /** The day also holds superseded/absorbed rows (history available). */
  hasHistory?: boolean;
  /** Import-time annotations (DCF incidence, observations) that travel with the row; persisted separately. */
  annotations?: ImportAnnotation[];
  /** Read-only planning DRAFT row shown in the Calendar (a shift_assignment, never a published shift). */
  isDraft?: boolean;
}

export interface ShiftWithDerived extends Shift {
  category: ShiftCategory;
  duration: number; // in hours
}

export interface WeeklyStats {
  totalWorkedHours: number;
  totalAbsenceHours: number;
  totalWorkedDays: number;
  freeDays: number;
  // Keyed by shift type id from the registry in shift-types.ts
  hoursByType: Record<string, number>;
  daysByType: Record<string, number>;
}
