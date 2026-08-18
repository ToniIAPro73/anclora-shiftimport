export type ShiftCategory = 'Mañana' | 'Tarde' | 'Noche';
export type ShiftOrigin = 'MAN' | 'PDF';

export interface Shift {
  id: string;
  date: string; // ISO YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  location: string;
  origin: ShiftOrigin;
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
