import { describe, expect, it, vi } from 'vitest';
import { classifyHistoricalIncoming } from './import-historical-conflicts';
import type { Shift } from './types';

const shift = (id: string, date: string, startTime: string, endTime: string, origin: 'IMP' | 'MAN' = 'IMP'): Shift => ({
  id, date, startTime, endTime, shiftType: 'Regular', countsAsWork: true, location: 'Regular', origin,
});

// Canonical failure: existing 2026-10-15 Regular 11:00-19:00, employee export says 10:00-18:00.
const existing = shift('existing-1', '2026-10-15', '11:00', '19:00');
const incoming = shift('incoming-1', '2026-10-15', '10:00', '18:00');
const sameAsExisting = shift('incoming-2', '2026-10-14', '09:00', '17:00');
const calendar = [existing, shift('existing-2', '2026-10-14', '09:00', '17:00')];
const schedule = (id: string, date: string, startTime: string, endTime: string, shiftType = 'Regular'): Shift => ({
  ...shift(id, date, startTime, endTime),
  origin: 'schedule' as Shift['origin'],
  shiftType,
  location: shiftType,
  layer: 'COMPANY_PLAN',
  effectiveState: 'EFFECTIVE',
});

describe('smart server reconciliation (MIXED + planner + historical-and-plan)', () => {
  it('never opens the legacy conflict prompt and never generates deleteIds: the server gets the differing row as-is', async () => {
    const requestDecision = vi.fn();
    const result = await classifyHistoricalIncoming({ incoming: [incoming, sameAsExisting], snapshot: calendar, smartServerReconciliation: true, requestDecision });
    expect(requestDecision).not.toHaveBeenCalled();
    expect(result.deleteIds).toEqual([]);
    expect(result.upserts).toEqual([]);
    expect(result.serverReconciledHistorical).toEqual([incoming]); // forwarded to confirm-split
    expect(result.identicalIncoming).toEqual([sameAsExisting]); // still part of the plan document
    expect(result.working.some((s) => s.id === 'existing-1')).toBe(true); // nothing is deleted locally either
    expect(result.aborted).toBe(false);
  });

  it('a new day (no existing shift) is still forwarded as a normal row', async () => {
    const result = await classifyHistoricalIncoming({ incoming: [shift('n', '2026-10-13', '09:00', '17:00')], snapshot: calendar, smartServerReconciliation: true, requestDecision: vi.fn() });
    expect(result.upserts).toHaveLength(1);
    expect(result.deleteIds).toEqual([]);
  });
});

describe('legacy path (pure historical Safe Import / self import) is unchanged', () => {
  it('asks the user per conflict; "replace" deletes the existing shift and inserts the imported one', async () => {
    const requestDecision = vi.fn().mockResolvedValue('replace');
    const result = await classifyHistoricalIncoming({ incoming: [incoming], snapshot: calendar, smartServerReconciliation: false, requestDecision });
    expect(requestDecision).toHaveBeenCalledWith(existing, incoming);
    expect(result.deleteIds).toEqual(['existing-1']);
    expect(result.upserts).toEqual([incoming]);
  });

  it('"skip" keeps the existing shift and "abort" stops the whole import', async () => {
    const skip = await classifyHistoricalIncoming({ incoming: [incoming], snapshot: calendar, smartServerReconciliation: false, requestDecision: vi.fn().mockResolvedValue('skip') });
    expect(skip.upserts).toEqual([]);
    expect(skip.deleteIds).toEqual([]);
    const abort = await classifyHistoricalIncoming({ incoming: [incoming], snapshot: calendar, smartServerReconciliation: false, requestDecision: vi.fn().mockResolvedValue('abort') });
    expect(abort.aborted).toBe(true);
  });
});

describe('semantic write-path equality across provenance', () => {
  it('schedule Regular vs incoming IMP same business shift is a no-op', async () => {
    const requestDecision = vi.fn();
    const result = await classifyHistoricalIncoming({
      incoming: [incoming],
      snapshot: [schedule('scheduled', '2026-10-15', '10:00', '18:00')],
      smartServerReconciliation: false,
      requestDecision,
    });
    expect(result.identicalIncoming).toEqual([incoming]);
    expect(result.upserts).toEqual([]);
    expect(result.deleteIds).toEqual([]);
    expect(requestDecision).not.toHaveBeenCalled();
  });

  it('schedule day off vs incoming IMP day off is a no-op', async () => {
    const dayOff: Shift = { ...shift('off-import', '2026-10-12', '', ''), shiftType: 'Libre', location: 'Libre' };
    const result = await classifyHistoricalIncoming({
      incoming: [dayOff],
      snapshot: [schedule('off-schedule', '2026-10-12', '', '', 'Libre')],
      smartServerReconciliation: false,
      requestDecision: vi.fn(),
    });
    expect(result.identicalIncoming).toEqual([dayOff]);
    expect(result.upserts).toEqual([]);
  });

  it('real schedule time change uses the existing safe conflict path exactly once', async () => {
    const requestDecision = vi.fn().mockResolvedValue('skip');
    const result = await classifyHistoricalIncoming({
      incoming: [incoming],
      snapshot: [schedule('scheduled', '2026-10-15', '11:00', '19:00')],
      smartServerReconciliation: false,
      requestDecision,
    });
    expect(requestDecision).toHaveBeenCalledTimes(1);
    expect(requestDecision).toHaveBeenCalledWith(expect.objectContaining({ id: 'scheduled' }), incoming);
    expect(result.upserts).toEqual([]);
    expect(result.deleteIds).toEqual([]);
    expect(result.aborted).toBe(false);
  });

  it('real schedule time change is handed to the existing server reconciliation path once', async () => {
    const result = await classifyHistoricalIncoming({
      incoming: [incoming],
      snapshot: [schedule('scheduled', '2026-10-15', '11:00', '19:00')],
      smartServerReconciliation: true,
      requestDecision: vi.fn(),
    });
    expect(result.serverReconciledHistorical).toEqual([incoming]);
    expect(result.upserts).toEqual([]);
    expect(result.deleteIds).toEqual([]);
  });

  it('fails closed when several same-day rows make the replacement target ambiguous', async () => {
    const result = await classifyHistoricalIncoming({
      incoming: [incoming],
      snapshot: [schedule('one', '2026-10-15', '09:00', '17:00'), schedule('two', '2026-10-15', '11:00', '19:00')],
      smartServerReconciliation: false,
      requestDecision: vi.fn(),
    });
    expect(result.aborted).toBe(true);
    expect(result.upserts).toEqual([]);
    expect(result.deleteIds).toEqual([]);
  });
});
