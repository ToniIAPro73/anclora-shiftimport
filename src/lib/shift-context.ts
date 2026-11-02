import { classifyKind, normalizeCalendarRow, resolveDay } from './effective-calendar.js';
import type { Role } from './session';

/**
 * Contextual manual-shift operations for a day that already holds effective assignments (SDD "Sustituir / Añadir").
 *
 * This module only DECIDES and PREVIEWS: it asks `resolveDay` (the same rules the server applies in `applyCalendarChange`) whether a
 * resulting day would be consistent. It never invents a rule, and the server re-validates everything: the recommendation is a hint,
 * the explicit confirmation of the user is what authorises the write.
 */
export type ShiftOperation = 'REPLACE' | 'ADD';

export interface ContextRowInput {
  id: string;
  shiftType?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  countsAsWork?: boolean | null;
  effectiveState?: string | null;
  /** Set on rows born from an approved vacation: a protected absence (F3). */
  timeOffRequestId?: string | null;
}

export interface IncomingShiftInput {
  shiftType: string;
  startTime?: string | null;
  endTime?: string | null;
  countsAsWork?: boolean | null;
}

export type OperationBlock =
  | 'PROTECTED_ABSENCE'
  | 'PROTECTED_ABSENCE_FORBIDDEN'
  | 'OVERLAP'
  | 'FULL_DAY_WITH_WORK'
  | 'FULL_DAY_CONFLICT'
  | 'MISSING_TIMES'
  | 'OTHER';

export interface OperationAvailability {
  allowed: boolean;
  blockedBy: OperationBlock | null;
}

export interface ShiftContextPlan {
  /** Current effective rows of the day (legacy duty-role rows excluded), in the order they are shown. */
  existing: ContextRowInput[];
  recommended: ShiftOperation | null;
  add: OperationAvailability;
  replace: OperationAvailability;
  /** Rows that can be replaced by the incoming shift leaving a consistent day. */
  validTargetIds: string[];
  /** Preselected target for REPLACE; null when the user must choose one explicitly. */
  defaultTargetId: string | null;
  /** The day holds an approved vacation (F3 protection applies). */
  protectedAbsence: boolean;
}

export type PreviewStatus = 'KEPT' | 'REPLACED' | 'NEW';
export interface PreviewRow {
  key: string;
  shiftType: string;
  startTime: string | null;
  endTime: string | null;
  status: PreviewStatus;
}

const BLOCK_BY_CODE: Record<string, OperationBlock> = {
  OVERLAP: 'OVERLAP',
  FULL_DAY_WITH_WORK: 'FULL_DAY_WITH_WORK',
  FULL_DAY_CONFLICT: 'FULL_DAY_CONFLICT',
  MISSING_TIMES: 'MISSING_TIMES',
};

const canOverrideProtected = (role?: Role | string | null) => role === 'OWNER' || role === 'ADMIN';

const isEffective = (row: ContextRowInput) => !row.effectiveState || row.effectiveState === 'EFFECTIVE';

function toCalendarRow(date: string, row: { shiftType?: string | null; startTime?: string | null; endTime?: string | null; countsAsWork?: boolean | null }) {
  return { date, shiftType: row.shiftType ?? '', startTime: row.startTime ?? null, endTime: row.endTime ?? null, countsAsWork: row.countsAsWork ?? null, effectiveState: 'EFFECTIVE' as const };
}

function kindOf(date: string, row: { shiftType?: string | null; startTime?: string | null; endTime?: string | null; countsAsWork?: boolean | null }) {
  return classifyKind(normalizeCalendarRow(toCalendarRow(date, row)));
}

/** First blocking code of the day the rows would form, or null when it is consistent. */
function firstBlock(date: string, rows: Array<{ shiftType?: string | null; startTime?: string | null; endTime?: string | null; countsAsWork?: boolean | null }>): OperationBlock | null {
  const issue = resolveDay(date, rows.map((row) => toCalendarRow(date, row))).issues.find((item) => item.blocking);
  return issue ? (BLOCK_BY_CODE[issue.code] ?? 'OTHER') : null;
}

/** Current effective rows that take part in the decision (legacy JT duty rows are metadata, never a target). */
export function contextualRows(date: string, rows: ContextRowInput[]): ContextRowInput[] {
  return rows.filter((row) => isEffective(row) && kindOf(date, row).kind !== 'LEGACY_DUTY_ROLE');
}

/**
 * Plans the operation for `incoming` on a day. Returns null when the day has no effective assignment: the shift is a plain direct add
 * and no dialog is needed.
 */
export function planShiftContext(input: { date: string; existing: ContextRowInput[]; incoming: IncomingShiftInput; role?: Role | string | null }): ShiftContextPlan | null {
  const { date, incoming, role } = input;
  const existing = contextualRows(date, input.existing);
  if (existing.length === 0) return null;

  const protectedAbsence = existing.some((row) => Boolean(row.timeOffRequestId));
  const incomingKind = kindOf(date, incoming);

  // ADD keeps every current row. It is never available beside a protected vacation (F3), and any inconsistency blocks it.
  const addBlock: OperationBlock | null = protectedAbsence ? 'PROTECTED_ABSENCE' : firstBlock(date, [...existing, incoming]);
  const add: OperationAvailability = { allowed: addBlock === null, blockedBy: addBlock };

  // REPLACE names exactly one row. A target is valid when the day that remains is consistent and the actor may touch it.
  const targetBlocks = new Map<string, OperationBlock | null>();
  for (const target of existing) {
    if (target.timeOffRequestId && !canOverrideProtected(role)) {
      targetBlocks.set(target.id, 'PROTECTED_ABSENCE_FORBIDDEN');
      continue;
    }
    targetBlocks.set(target.id, firstBlock(date, [...existing.filter((row) => row.id !== target.id), incoming]));
  }
  const validTargetIds = existing.filter((row) => targetBlocks.get(row.id) === null).map((row) => row.id);
  const replaceBlock = validTargetIds.length > 0
    ? null
    : (existing.every((row) => targetBlocks.get(row.id) === 'PROTECTED_ABSENCE_FORBIDDEN') ? 'PROTECTED_ABSENCE_FORBIDDEN' : (targetBlocks.get(existing[0].id) ?? 'OTHER'));
  const replace: OperationAvailability = { allowed: validTargetIds.length > 0, blockedBy: replaceBlock };

  // Recommendation (always only a preselection; the user confirms explicitly).
  let recommended: ShiftOperation | null = null;
  let defaultTargetId: string | null = null;
  const fullDayRows = existing.filter((row) => kindOf(date, row).kind === 'FULL_DAY');
  const sameType = existing.filter((row) => {
    const kind = kindOf(date, row);
    return kind.kind === incomingKind.kind && kind.type === incomingKind.type;
  });
  if (protectedAbsence) {
    recommended = null; // protected flow: explicit choice, only OWNER/ADMIN can proceed
  } else if (incomingKind.kind === 'WORK' && fullDayRows.length === 1 && validTargetIds.includes(fullDayRows[0].id)) {
    recommended = 'REPLACE'; // a day off worked: the day-off marker is superseded (D-01)
    defaultTargetId = fullDayRows[0].id;
  } else if (sameType.length > 0) {
    recommended = 'REPLACE'; // a corrected Regular over a Regular: never duplicate by default
    const candidates = sameType.filter((row) => validTargetIds.includes(row.id));
    defaultTargetId = candidates.length === 1 ? candidates[0].id : null;
  } else if (add.allowed) {
    recommended = 'ADD'; // e.g. Regular + non-overlapping Extras (D-03)
  }
  if (recommended !== 'REPLACE' && !defaultTargetId && validTargetIds.length === 1 && existing.length === 1) defaultTargetId = validTargetIds[0];

  return { existing, recommended, add, replace, validTargetIds, defaultTargetId, protectedAbsence };
}

/** The day exactly as it would remain after the operation, each row marked as kept, replaced or new. */
export function previewShiftOperation(input: { existing: ContextRowInput[]; incoming: IncomingShiftInput; operation: ShiftOperation; targetId: string | null }): PreviewRow[] {
  const rows: PreviewRow[] = input.existing.map((row) => ({
    key: row.id,
    shiftType: row.shiftType ?? '',
    startTime: row.startTime ? String(row.startTime).slice(0, 5) : null,
    endTime: row.endTime ? String(row.endTime).slice(0, 5) : null,
    status: input.operation === 'REPLACE' && row.id === input.targetId ? 'REPLACED' : 'KEPT',
  }));
  rows.push({
    key: 'new',
    shiftType: input.incoming.shiftType,
    startTime: input.incoming.startTime ? String(input.incoming.startTime).slice(0, 5) : null,
    endTime: input.incoming.endTime ? String(input.incoming.endTime).slice(0, 5) : null,
    status: 'NEW',
  });
  return rows;
}

/** Maps the operation onto the existing `calendar_changes` vocabulary (no new change type is introduced). */
export function changeTypeFor(date: string, operation: ShiftOperation, incoming: IncomingShiftInput, target: ContextRowInput | null): string {
  const incomingKind = kindOf(date, incoming);
  if (operation === 'ADD') return incomingKind.type === 'Extras' ? 'ADD_EXTRA' : 'ADD_SHIFT';
  const targetKind = target ? kindOf(date, target) : null;
  return targetKind && targetKind.type === incomingKind.type ? 'TIME_CHANGE' : 'TYPE_CHANGE';
}
