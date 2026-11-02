import { describe, expect, it } from 'vitest';
import { computeEffectiveStats } from './effective-calendar.js';
import { changeTypeFor, planShiftContext, previewShiftOperation, type ContextRowInput } from './shift-context';

const DATE = '2026-11-10';
const regular = (id: string, startTime = '08:00', endTime = '16:00'): ContextRowInput => ({ id, shiftType: 'Regular', startTime, endTime, effectiveState: 'EFFECTIVE' });
const dayOff = (id = 'off'): ContextRowInput => ({ id, shiftType: 'Libre', startTime: null, endTime: null, effectiveState: 'EFFECTIVE' });
const extras = (startTime: string, endTime: string) => ({ shiftType: 'Extras', startTime, endTime });

describe('planShiftContext (matrix of SDD "Sustituir / Añadir")', () => {
  it('no effective assignment: direct add, no dialog', () => {
    expect(planShiftContext({ date: DATE, existing: [], incoming: extras('16:00', '19:00'), role: 'ADMIN' })).toBeNull();
    // superseded history and legacy JT duty rows are not assignments
    expect(planShiftContext({ date: DATE, existing: [{ id: 'old', shiftType: 'Regular', startTime: '08:00', endTime: '16:00', effectiveState: 'SUPERSEDED' }, { id: 'jt', shiftType: 'JT', startTime: '08:00', endTime: '15:00', effectiveState: 'EFFECTIVE' }], incoming: extras('16:00', '19:00'), role: 'ADMIN' })).toBeNull();
  });

  it('day off + Extras: REPLACE recommended and preselected, ADD incompatible (D-01)', () => {
    const plan = planShiftContext({ date: DATE, existing: [dayOff()], incoming: extras('16:00', '19:00'), role: 'ADMIN' })!;
    expect(plan.recommended).toBe('REPLACE');
    expect(plan.defaultTargetId).toBe('off');
    expect(plan.add).toEqual({ allowed: false, blockedBy: 'FULL_DAY_WITH_WORK' });
    expect(plan.replace.allowed).toBe(true);
  });

  it('day off + Regular: REPLACE, ADD incompatible', () => {
    const plan = planShiftContext({ date: DATE, existing: [dayOff()], incoming: { shiftType: 'Regular', startTime: '08:00', endTime: '16:00' }, role: 'OWNER' })!;
    expect(plan.recommended).toBe('REPLACE');
    expect(plan.add.allowed).toBe(false);
    expect(plan.defaultTargetId).toBe('off');
  });

  it('Regular + non-overlapping Extras: ADD recommended, REPLACE still selectable (D-03)', () => {
    const plan = planShiftContext({ date: DATE, existing: [regular('reg')], incoming: extras('18:00', '21:00'), role: 'ADMIN' })!;
    expect(plan.recommended).toBe('ADD');
    expect(plan.add.allowed).toBe(true);
    expect(plan.replace.allowed).toBe(true);
    expect(plan.defaultTargetId).toBe('reg');
  });

  it('Regular + corrected Regular: REPLACE by default, never a duplicate by default', () => {
    const plan = planShiftContext({ date: DATE, existing: [regular('reg')], incoming: { shiftType: 'Regular', startTime: '09:00', endTime: '17:00' }, role: 'PLANNER' })!;
    expect(plan.recommended).toBe('REPLACE');
    expect(plan.defaultTargetId).toBe('reg');
    expect(plan.add).toEqual({ allowed: false, blockedBy: 'OVERLAP' });
  });

  it('Regular + overlapping Extras: no recommendation, ADD blocked until the conflict is resolved', () => {
    const plan = planShiftContext({ date: DATE, existing: [regular('reg')], incoming: extras('15:00', '18:00'), role: 'ADMIN' })!;
    expect(plan.recommended).toBeNull();
    expect(plan.add).toEqual({ allowed: false, blockedBy: 'OVERLAP' });
    expect(plan.replace.allowed).toBe(true); // only by explicit choice
  });

  it('several rows: REPLACE needs an exact target and only consistent targets are valid', () => {
    const rows = [regular('morning', '08:00', '12:00'), regular('afternoon', '14:00', '18:00')];
    const plan = planShiftContext({ date: DATE, existing: rows, incoming: { shiftType: 'Regular', startTime: '14:00', endTime: '19:00' }, role: 'ADMIN' })!;
    expect(plan.recommended).toBe('REPLACE');
    expect(plan.validTargetIds).toEqual(['afternoon']);
    expect(plan.defaultTargetId).toBe('afternoon');
    const ambiguous = planShiftContext({ date: DATE, existing: rows, incoming: extras('20:00', '22:00'), role: 'ADMIN' })!;
    expect(ambiguous.recommended).toBe('ADD');
    expect(ambiguous.defaultTargetId).toBeNull(); // several rows and no obvious one: the user must choose
  });

  it('approved vacation: protected flow, ADD never, REPLACE only for OWNER/ADMIN', () => {
    const vacation: ContextRowInput = { id: 'vac', shiftType: 'Vacaciones', startTime: null, endTime: null, effectiveState: 'EFFECTIVE', timeOffRequestId: 'tor-1' };
    const planner = planShiftContext({ date: DATE, existing: [vacation], incoming: extras('16:00', '19:00'), role: 'PLANNER' })!;
    expect(planner.protectedAbsence).toBe(true);
    expect(planner.recommended).toBeNull();
    expect(planner.add).toEqual({ allowed: false, blockedBy: 'PROTECTED_ABSENCE' });
    expect(planner.replace).toEqual({ allowed: false, blockedBy: 'PROTECTED_ABSENCE_FORBIDDEN' });
    const admin = planShiftContext({ date: DATE, existing: [vacation], incoming: extras('16:00', '19:00'), role: 'ADMIN' })!;
    expect(admin.recommended).toBeNull();
    expect(admin.add.allowed).toBe(false);
    expect(admin.replace.allowed).toBe(true);
  });
});

describe('preview and change type', () => {
  it('previews REPLACE with only the chosen row replaced, and ADD keeping everything', () => {
    const existing = [regular('a', '08:00', '12:00'), regular('b', '14:00', '18:00')];
    const incoming = { shiftType: 'Regular', startTime: '14:00', endTime: '19:00' };
    expect(previewShiftOperation({ existing, incoming, operation: 'REPLACE', targetId: 'b' }).map((row) => `${row.key}:${row.status}`)).toEqual(['a:KEPT', 'b:REPLACED', 'new:NEW']);
    expect(previewShiftOperation({ existing, incoming, operation: 'ADD', targetId: null }).map((row) => row.status)).toEqual(['KEPT', 'KEPT', 'NEW']);
  });

  it('maps onto the existing calendar_changes vocabulary', () => {
    expect(changeTypeFor(DATE, 'ADD', extras('18:00', '21:00'), null)).toBe('ADD_EXTRA');
    expect(changeTypeFor(DATE, 'ADD', { shiftType: 'Regular', startTime: '08:00', endTime: '12:00' }, null)).toBe('ADD_SHIFT');
    expect(changeTypeFor(DATE, 'REPLACE', extras('16:00', '19:00'), dayOff())).toBe('TYPE_CHANGE');
    expect(changeTypeFor(DATE, 'REPLACE', { shiftType: 'Regular', startTime: '09:00', endTime: '17:00' }, regular('reg'))).toBe('TIME_CHANGE');
  });
});

describe('statistics after the operation (D-01 / D-03)', () => {
  const stats = (rows: Array<Record<string, unknown>>) => computeEffectiveStats(rows as never, { from: '2026-11-01', to: '2026-11-30', today: '2026-12-01' }).total;

  it('D-01: a superseded day off is not an enjoyed day off, and the 3 extra hours add no regular work', () => {
    const total = stats([
      { id: 'off', date: DATE, shiftType: 'Libre', effectiveState: 'SUPERSEDED' },
      { id: 'ex', date: DATE, shiftType: 'Extras', startTime: '16:00', endTime: '19:00', effectiveState: 'EFFECTIVE' },
    ]);
    expect(total.freeDays).toBe(0);
    expect(total.regularMinutes).toBe(0);
    expect(total.extrasMinutes).toBe(180);
    expect(total.byType?.Regular ?? 0).toBe(0);
  });

  it('control: the same day off still effective counts as an enjoyed day off', () => {
    expect(stats([{ id: 'off', date: DATE, shiftType: 'Libre', effectiveState: 'EFFECTIVE' }]).freeDays).toBe(1);
  });

  it('D-03: Regular + Extras the same day is one worked date, 8 regular hours and 3 extra hours, not two regular days', () => {
    const total = stats([
      { id: 'reg', date: DATE, shiftType: 'Regular', startTime: '08:00', endTime: '16:00', effectiveState: 'EFFECTIVE' },
      { id: 'ex', date: DATE, shiftType: 'Extras', startTime: '18:00', endTime: '21:00', effectiveState: 'EFFECTIVE' },
    ]);
    expect(total.workedDays).toBe(1);
    expect(total.regularMinutes).toBe(480);
    expect(total.extrasMinutes).toBe(180);
  });

  it('a replaced Regular does not stay in the totals', () => {
    const total = stats([
      { id: 'old', date: DATE, shiftType: 'Regular', startTime: '08:00', endTime: '16:00', effectiveState: 'SUPERSEDED' },
      { id: 'new', date: DATE, shiftType: 'Regular', startTime: '09:00', endTime: '17:00', effectiveState: 'EFFECTIVE' },
    ]);
    expect(total.regularMinutes).toBe(480);
    expect(total.workedDays).toBe(1);
  });
});
