export type TemporalClass = 'HISTORICAL' | 'FUTURE' | 'MIXED';
export type DocumentClass = 'COMPANY_PLAN' | 'COMPANY_PLAN_UPDATE' | 'HISTORICAL_CALENDAR' | 'UNDETERMINED';
export type ImportDecision = 'historical-only' | 'historical-and-plan';
export type ReconciliationOutcomeKind = 'UNCHANGED' | 'NEW' | 'KEPT_LOCAL' | 'MODIFIED' | 'COMPANY_ADOPTED_LOCAL' | 'REQUIRES_REVIEW' | 'EVIDENCE_APPLIED';

export interface PlanRowInput {
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
export interface PlanEntry { employeeKey: string; row: PlanRowInput; evidence?: boolean }
export interface PlanRevisionInput { revisionNumber: number; coverageFrom: string; coverageTo: string; rows: PlanEntry[] }
export interface ReconciliationItem {
  employeeKey: string; date: string; outcome: ReconciliationOutcomeKind; retrospective: boolean; evidence?: boolean;
  next: PlanRowInput[]; baseline: PlanRowInput[] | null; effective: PlanRowInput[] | null;
}
export interface OutcomeSummary { total: number; unchanged: number; new: number; keptLocal: number; modified: number; companyAdoptedLocal: number; requiresReview: number; evidenceApplied: number }

export const TEMPORAL_CLASS: Readonly<Record<TemporalClass, TemporalClass>>;
export const DOCUMENT_CLASS: Readonly<Record<DocumentClass, DocumentClass>>;
export const IMPORT_DECISION: Readonly<{ HISTORICAL_ONLY: 'historical-only'; HISTORICAL_AND_PLAN: 'historical-and-plan' }>;
export const RECONCILIATION_OUTCOME: Readonly<Record<ReconciliationOutcomeKind, ReconciliationOutcomeKind>>;
export const WRITES_TO_PLAN: ReadonlySet<ReconciliationOutcomeKind>;

export function normalizeImportDecision(value: unknown): ImportDecision;
export function splitByOperationalDate<T extends { date: string }>(rows: T[], today: string): { historical: T[]; future: T[] };
export function classifyTemporal(rows: Array<{ date: string }>, today: string): TemporalClass;
export function classifyDocument(input: { temporal: TemporalClass; employeeCount: number; hasExistingPlan?: boolean; rowCount?: number }): { documentClass: DocumentClass; confidence: string; evidence: string[] };
export function resolveImportOptions(input: { canPlan: boolean; temporal: TemporalClass }): { options: ImportDecision[]; default: ImportDecision; futureAllowed: boolean };
export function employeeBusinessKey(employee: { externalEmployeeId?: string | null; external_employee_id?: string | null; name?: string | null } | null | undefined): string | null;
export function normalizePlanRow(row: PlanRowInput): { date: string; type: string; start: string; end: string; duty: string };
export function planRowSignature(employeeKey: string, row: PlanRowInput): string;
export function planCanonicalLines(rows: PlanEntry[]): string[];
export function resolveBaseline(revisions: PlanRevisionInput[], range: { from: string; to: string }): PlanEntry[];
export function reconcileThreeWay(input: { baseline: PlanEntry[]; next: PlanEntry[]; effective: PlanEntry[]; today: string; reviewDays?: Set<string>; planOnlyDays?: Set<string> }): ReconciliationItem[];
export function summarizeOutcomes(outcomes: ReconciliationItem[]): OutcomeSummary;
export function sameContent(a: PlanRowInput | null | undefined, b: PlanRowInput | null | undefined): boolean;
export function daySignature(rows?: PlanRowInput[]): string;
export function sameDay(a?: PlanRowInput[], b?: PlanRowInput[]): boolean;
export function hasSemanticDayChange(before?: PlanRowInput[], after?: PlanRowInput[]): boolean;
export function hasSemanticHistoryChange(effectiveRows?: PlanRowInput[], historicRows?: PlanRowInput[]): boolean;
