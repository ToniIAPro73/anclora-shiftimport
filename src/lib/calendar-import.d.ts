export type TemporalClass = 'HISTORICAL' | 'FUTURE' | 'MIXED';
export type DocumentClass = 'PLANNING_DRAFT' | 'PLANNING_UPDATE' | 'HISTORICAL_CALENDAR' | 'UNDETERMINED';
export type ImportDecision = 'historical-only' | 'historical-and-plan' | 'historical-and-auto-publish';
export type ReconciliationOutcomeKind = 'UNCHANGED' | 'NEW' | 'MODIFIED' | 'REQUIRES_REVIEW';

export interface CalendarRowInput {
  date: string;
  shiftType?: string | null;
  shift_type?: string | null;
  location?: string | null;
  startTime?: string | null;
  start_time?: string | null;
  endTime?: string | null;
  end_time?: string | null;
  countsAsWork?: boolean | null;
  counts_as_work?: boolean | null;
  dutyRole?: string | null;
  duty_role?: string | null;
}
export interface CalendarEntry { employeeKey: string; row: CalendarRowInput }
export interface ReconciliationItem {
  employeeKey: string; date: string; outcome: ReconciliationOutcomeKind; retrospective: boolean;
  next: CalendarRowInput[]; effective: CalendarRowInput[] | null;
}
export interface OutcomeSummary { total: number; unchanged: number; new: number; modified: number; requiresReview: number }

export const TEMPORAL_CLASS: Readonly<Record<TemporalClass, TemporalClass>>;
export const DOCUMENT_CLASS: Readonly<Record<DocumentClass, DocumentClass>>;
export const IMPORT_DECISION: Readonly<{ HISTORICAL_ONLY: 'historical-only'; HISTORICAL_AND_PLAN: 'historical-and-plan'; HISTORICAL_AND_AUTO_PUBLISH: 'historical-and-auto-publish' }>;
export const RECONCILIATION_OUTCOME: Readonly<Record<ReconciliationOutcomeKind, ReconciliationOutcomeKind>>;
export const WRITES_TO_DRAFT: ReadonlySet<ReconciliationOutcomeKind>;

export function normalizeImportDecision(value: unknown): ImportDecision;
export function splitByOperationalDate<T extends { date: string }>(rows: T[], today: string): { historical: T[]; future: T[] };
export function classifyTemporal(rows: Array<{ date: string }>, today: string): TemporalClass;
export function classifyDocument(input: { temporal: TemporalClass; employeeCount: number; hasExistingSchedule?: boolean; rowCount?: number }): { documentClass: DocumentClass; confidence: string; evidence: string[] };
export function resolveImportOptions(input: { canPlan: boolean; temporal: TemporalClass; autoPublish?: boolean }): { options: ImportDecision[]; default: ImportDecision; futureAllowed: boolean };
export function employeeBusinessKey(employee: { externalEmployeeId?: string | null; external_employee_id?: string | null; name?: string | null } | null | undefined): string | null;
export function normalizeImportedCalendarRow(row: CalendarRowInput): { date: string; type: string; start: string; end: string; duty: string };
export function reconcileCurrentProposal(input: { proposed: CalendarEntry[]; current: CalendarEntry[]; today: string; reviewDays?: Set<string> }): ReconciliationItem[];
export function summarizeOutcomes(outcomes: ReconciliationItem[]): OutcomeSummary;
export function daySignature(rows?: CalendarRowInput[]): string;
export function sameDay(a?: CalendarRowInput[], b?: CalendarRowInput[]): boolean;
export function hasSemanticDayChange(before?: CalendarRowInput[], after?: CalendarRowInput[]): boolean;
export function hasSemanticHistoryChange(effectiveRows?: CalendarRowInput[], historicRows?: CalendarRowInput[]): boolean;
