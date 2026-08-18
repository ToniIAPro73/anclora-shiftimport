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
  location: string;
  origin: ShiftOrigin;
  sourceFormat?: ShiftSourceFormat;
}

export interface ShiftWithDerived extends Shift {
  category: ShiftCategory;
  duration: number; // in hours
}

export interface WeeklyStats {
  totalWorkedHours: number;
  totalWorkedDays: number;
  freeDays: number;
  // Keyed by shift type id from the registry in shift-types.ts
  hoursByType: Record<string, number>;
  daysByType: Record<string, number>;
}
