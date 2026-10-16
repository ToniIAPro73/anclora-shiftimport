/**
 * Source kind = WHAT KIND OF DOCUMENT this is (who produced it and what it represents).
 * It is independent of the temporal class (which dates it holds) and of the business class
 * (what effect it has). It is derived from structural evidence in the content, never from the file name.
 */
export type SourceKind =
  | 'EMPLOYEE_CALENDAR_EXPORT'
  | 'PUBLISHED_CALENDAR_EXPORT'
  | 'TEAM_SCHEDULE_EXPORT'
  | 'UNKNOWN';

export interface SourceKindEvidence {
  /** Value of the "Calendario" row of a TRYP "Leyenda" sheet (Empleado / Publicado). */
  legendCalendar?: string | null;
  sheetNames?: string[];
  /** Multi-employee roster evidence (PDF/XLSX team schedules). */
  team?: { employeeCount: number; withPayrollId: number } | null;
}

const norm = (value: string | null | undefined) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export function detectSourceKind(evidence: SourceKindEvidence): SourceKind {
  const legend = norm(evidence.legendCalendar);
  if (legend === 'empleado') return 'EMPLOYEE_CALENDAR_EXPORT';
  if (legend === 'publicado') return 'PUBLISHED_CALENDAR_EXPORT';
  if (evidence.team && evidence.team.employeeCount > 1 && evidence.team.withPayrollId > 0) return 'TEAM_SCHEDULE_EXPORT';
  // Sheet names are a SECONDARY signal only, used when the legend row is absent.
  const sheets = (evidence.sheetNames ?? []).map(norm);
  if (sheets.some((name) => name === 'calendario empleado')) return 'EMPLOYEE_CALENDAR_EXPORT';
  if (sheets.some((name) => name === 'calendario publicado')) return 'PUBLISHED_CALENDAR_EXPORT';
  return 'UNKNOWN';
}

/** Identity namespace of the payroll number carried by a source (the same person has different numbers per system). */
export function sourceSystemFor(kind: SourceKind): string | null {
  if (kind === 'EMPLOYEE_CALENDAR_EXPORT' || kind === 'PUBLISHED_CALENDAR_EXPORT') return 'TRYP_EMPLOYEE_CALENDAR';
  if (kind === 'TEAM_SCHEDULE_EXPORT') return 'TRYP_TEAM_SCHEDULE';
  return null;
}

/** Published calendars and team schedules ARE the company plan; an employee calendar is effective-calendar evidence. */
export const isCompanyPlanSource = (kind: SourceKind): boolean => kind === 'PUBLISHED_CALENDAR_EXPORT' || kind === 'TEAM_SCHEDULE_EXPORT';
