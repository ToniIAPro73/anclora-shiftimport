export type EffectiveState = 'EFFECTIVE' | 'SUPERSEDED' | 'ABSORBED' | 'METADATA_ONLY' | 'REQUIRES_REVIEW';
export type CalendarLayer = 'COMPANY_PLAN' | 'CHANGE';
export type Provenance = 'COMPANY_IMPORT' | 'MANUAL_ADMIN_CHANGE' | 'EMPLOYEE_REQUEST' | 'SCHEDULE_PUBLICATION' | 'MIGRATION' | 'SYSTEM';
export type ContractStatus = 'NO_DATA' | 'INSUFFICIENT_DATA' | 'UNCONFIGURED' | 'BELOW_MINIMUM' | 'WITHIN_RANGE' | 'ABOVE_MAXIMUM';

export interface CalendarRowInput {
  id?: string | null;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  shiftType?: string | null;
  shift_type?: string | null;
  location?: string | null;
  countsAsWork?: boolean | null;
  counts_as_work?: boolean | null;
  effectiveState?: EffectiveState | null;
  effective_state?: EffectiveState | null;
  layer?: CalendarLayer | null;
  provenance?: Provenance | string | null;
  legacyOrigin?: string | null;
  legacy_origin?: string | null;
  dutyRole?: string | null;
  duty_role?: string | null;
  planRevision?: number | null;
  plan_revision?: number | null;
  createdAt?: string | null;
  created_at?: string | null;
  importId?: string | null;
  import_id?: string | null;
  changeId?: string | null;
  change_id?: string | null;
  currentEvidence?: boolean;
  current_evidence?: boolean;
}

export interface NormalizedCalendarRow {
  id: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  shiftType: string;
  countsAsWork: boolean | null;
  effectiveState: EffectiveState;
  layer: CalendarLayer;
  provenance: string | null;
  legacyOrigin: string | null;
  dutyRole: string | null;
  planRevision: number;
  createdAt: string | null;
  importId: string | null;
  changeId: string | null;
  currentEvidence?: boolean;
}

export interface DayIssue { code: string; blocking: boolean; [key: string]: unknown }
export interface ResolvedDay {
  date: string;
  status: string;
  accountingStatus: string;
  fullDayType: string | null;
  workIntervals: Array<{ start: number; end: number; type: string }>;
  absenceIntervals: Array<{ start: number; end: number; type: string }>;
  minutes: { regular: number; extras: number; other: number; unclassified: number; work: number; absence: number; duty: number };
  byType: Record<string, number>;
  issues: DayIssue[];
  requiresReview: boolean;
  countedProvisionally: boolean;
  provisionalReason: string | null;
  currentRows: NormalizedCalendarRow[];
  proposedRows: NormalizedCalendarRow[];
  legacyDutyRows: number;
  dutyRole: string | null;
  duplicateRows: number;
}

export interface StatsBucket {
  effectiveMinutes: number;
  regularMinutes: number;
  extrasMinutes: number;
  otherWorkMinutes: number;
  unclassifiedWorkMinutes: number;
  absenceMinutes: number;
  dutyMinutes: number;
  dutyDays: number;
  workedDays: number;
  freeDays: number;
  vacationDays: number;
  sickLeaveDays: number;
}

export interface EffectiveStats {
  calendarRows: number;
  total: StatsBucket;
  realized: StatsBucket;
  planned: StatsBucket;
  byType: Record<string, number>;
  unresolvedDays: number;
  unresolved: Array<{ date: string; status: string; issues: string[] }>;
  legacyDutyRows: number;
  duplicateRows: number;
  days: ResolvedDay[];
  totalReviewDays: number;
  currentEffectiveDays: number;
  auditCurrentDays: number;
  legacyJtDays: number;
  legacyOldestDays: number;
  ambiguousTieDays: number;
  otherUncountedDays: number;
  provisionalReviewDays: number;
  provisionalReviewMinutes: number;
  unresolvedUncountedDays: number;
  realizedProvisionalReviewDays: number;
  plannedProvisionalReviewDays: number;
  realizedProvisionalReviewMinutes: number;
  plannedProvisionalReviewMinutes: number;
}

export interface AnnualTargetInput { minimumAnnualMinutes?: number | null; maximumAnnualMinutes?: number | null }
export interface ContractEvaluation {
  status: ContractStatus;
  effectiveMinutes: number;
  minimumMinutes?: number;
  maximumMinutes?: number;
  marginMinutes?: number;
  missingToMinimumMinutes?: number;
  aboveMinimumMinutes?: number;
  marginUsedMinutes?: number;
  marginRemainingMinutes?: number;
  excessOverMaximumMinutes?: number;
  maximumReached?: boolean;
}

export interface DayProvenance {
  effective: NormalizedCalendarRow[];
  current: NormalizedCalendarRow[];
  proposed: NormalizedCalendarRow[];
  countedProvisionally: boolean;
  provisionalReason: string | null;
  changes: Array<Record<string, unknown>>;
  requiresReview: boolean;
  legacyDutyRows: NormalizedCalendarRow[];
}

export const EFFECTIVE_STATES: Readonly<Record<EffectiveState, EffectiveState>>;
export const CALENDAR_LAYERS: Readonly<Record<CalendarLayer, CalendarLayer>>;
export const PROVENANCE: Readonly<Record<Provenance, Provenance>>;
export const CHANGE_TYPES: readonly string[];
export const CONTRACT_STATUS: Readonly<Record<ContractStatus, ContractStatus>>;
export const JT_COUNTS_AS_WORK_INTERVAL: true;
export const JT_COUNTS_AS_ADDITIONAL_WORK: false;
export const LEGACY_UNCLASSIFIED_WORK: 'LEGACY_UNCLASSIFIED_WORK';
export const DUTY_ROLE_SHIFT_LEAD: 'shift_lead';

export function toMinutes(value: string | null | undefined): number | null;
export function formatClock(minutes: number): string;
export function normalizeCalendarRow(row: CalendarRowInput): NormalizedCalendarRow;
export function classifyKind(row: NormalizedCalendarRow): { kind: string; type: string; bucket?: string };
export function resolveProvisionalReviewRows(rows: CalendarRowInput[]): { counted: boolean; reason: string; rows: NormalizedCalendarRow[] };
export function projectCurrentCalendarRows<T extends CalendarRowInput>(rows: T[]): T[];
export function attachAuditCurrentEvidence(rows: CalendarRowInput[], changes?: Array<Record<string, unknown>>): NormalizedCalendarRow[];
export function resolveDay(date: string, rows: CalendarRowInput[]): ResolvedDay;
export function findOvernightSpillConflicts(days: ResolvedDay[]): Array<{ date: string; nextDate: string; code: string }>;
export function computeEffectiveStats(rows: CalendarRowInput[], options?: { from?: string; to?: string; today?: string }): EffectiveStats;
export function evaluateAnnualTarget(effectiveMinutes: number, target?: AnnualTargetInput | null, options?: { calendarRows?: number | null }): ContractEvaluation;
export function hoursToMinutes(hours: number): number;
export function splitMinutes(totalMinutes: number): { sign: 1 | -1; hours: number; minutes: number };
export function buildDayProvenance(rows: CalendarRowInput[], changes?: Array<Record<string, unknown>>): DayProvenance;
