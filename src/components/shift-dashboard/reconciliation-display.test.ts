import { describe, expect, it } from 'vitest';
import { classifyReason, cleanReason, hasSemanticDayChange, humanizeReason, normalizeChangeRows, summarizeReason } from './reconciliation-display';
import { reconciliationPageSize } from './reconciliation-paging';

describe('reconciliation reason display', () => {
  it('strips run tags and UUIDs', () => {
    expect(cleanReason('[run 1acfbb93-09f0-40c3-9860-8de50a26b3d8] Reconciled (HIGH): ok')).toBe('Reconciled (HIGH): ok');
    expect(cleanReason('Ref 1acfbb93-09f0-40c3-9860-8de50a26b3d8 aprobado')).toBe('Ref aprobado');
    expect(cleanReason(null)).toBe('');
  });

  it('classifies and shortens', () => {
    expect(summarizeReason('[run abc] consistent with company calendar').kind).toBe('matchesPlan');
    expect(summarizeReason('').kind).toBe('reconciled');
    const long = summarizeReason('x'.repeat(200));
    expect(long.text.length).toBeLessThanOrEqual(48);
    expect(long.full.length).toBe(200);
  });
});

describe('humanizeReason (audit jargon never reaches the user)', () => {
  it('hides stored reasons that carry internal codes and keeps plain ones', () => {
    expect(humanizeReason('[run 1acfbb93-09f0-40c3-9860-8de50a26b3d8] Marked REQUIRES_REVIEW (MEDIUM): COMPANY_REVISED_PLAN_WITHOUT_EVIDENCE')).toBeNull();
    expect(humanizeReason('Cambio acordado con el jefe de turno')).toBe('Cambio acordado con el jefe de turno');
    expect(summarizeReason('Marked REQUIRES_REVIEW (MEDIUM): JT_INTERVAL_OUTSIDE_EFFECTIVE_SPAN').kind).toBe('reconciled');
  });
});

describe('one interpretation of legacy reasons (presentation only)', () => {
  const LEGACY = '[run 1acfbb93-09f0-40c3-9860-8de50a26b3d8] Reconciled (HIGH): consistent with company calendar';
  it('the legacy "Reconciled (HIGH)" text means "already matched the calendar" and leaks nothing', () => {
    expect(classifyReason(LEGACY)).toEqual({ kind: 'matchesCalendar', text: '' });
    expect(humanizeReason(LEGACY)).toBeNull();
    expect(summarizeReason(LEGACY).kind).toBe('matchesPlan');
  });
  it('audit jargon (Marked REQUIRES_REVIEW (LOW) …, internal codes, confidence levels) is never shown as text', () => {
    for (const raw of ['Marked REQUIRES_REVIEW (LOW): no exact match', 'NO_EXACT_MATCH', 'JT_ONLY_DAY', 'Reconciled (MEDIUM): something', '[run abc] Marked REQUIRES_REVIEW']) {
      expect(classifyReason(raw).kind).toBe('automatic');
      expect(humanizeReason(raw)).toBeNull();
    }
  });
  it('a reason written by a person stays as typed (ids and run tags removed)', () => {
    expect(classifyReason('[run 1acfbb93-09f0-40c3-9860-8de50a26b3d8] Confirmado con la empresa')).toEqual({ kind: 'text', text: 'Confirmado con la empresa' });
  });
  it('hasSemanticDayChange ignores ids/order and detects a real difference', () => {
    expect(hasSemanticDayChange([{ shiftType: 'Vacaciones' }], [{ shiftType: 'Vacaciones' }])).toBe(false);
    expect(hasSemanticDayChange([{ shiftType: 'Vacaciones' }], [{ shiftType: 'Libre' }])).toBe(true);
  });
  it('rows per page follow the window height (pagination instead of an outer scroll)', () => {
    expect(reconciliationPageSize(900)).toBe(4);
    expect(reconciliationPageSize(650)).toBe(3);
    expect(reconciliationPageSize(500)).toBe(2);
    expect(reconciliationPageSize(undefined)).toBe(4);
  });
});

describe('audit snapshot rows', () => {
  it('reads both stored shapes ({type,start,end} and {shiftType,startTime,endTime})', () => {
    expect(normalizeChangeRows([{ type: 'Vacaciones', start: null, end: null }])).toEqual([{ shiftType: 'Vacaciones', startTime: null, endTime: null }]);
    expect(normalizeChangeRows([{ shiftType: 'Regular', startTime: '05:00', endTime: '13:00' }])).toEqual([{ shiftType: 'Regular', startTime: '05:00', endTime: '13:00' }]);
    expect(hasSemanticDayChange(normalizeChangeRows([{ type: 'Vacaciones' }]), normalizeChangeRows([{ type: 'Vacaciones' }]))).toBe(false);
    expect(hasSemanticDayChange(normalizeChangeRows([{ type: 'Vacaciones' }]), normalizeChangeRows([{ type: 'Libre' }]))).toBe(true);
  });
});
