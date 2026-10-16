import { describe, expect, it } from 'vitest';
import { classifyCompanyCell, naiveAndUnionMinutes, reconcileDay } from './reconcile-lib.mjs';

const row = (id, type, start, end, legacyOrigin = 'PDF', origin = 'IMP') => ({ id, type, start, end, legacyOrigin, origin });
const state = (result, id) => result.dispositions.find((d) => d.id === id);

describe('company calendar cells', () => {
  it('maps DL/AJ -> Libre, green -> Vacaciones, blue -> Baja, times -> Regular', () => {
    expect(classifyCompanyCell({ text: 'DL', fill: 'FFDADADA' })).toMatchObject({ type: 'Libre' });
    expect(classifyCompanyCell({ text: 'AJ', fill: 'FFDADADA' })).toMatchObject({ type: 'Libre' });
    expect(classifyCompanyCell({ text: ' \n', fill: 'FFAEFC04' })).toMatchObject({ type: 'Vacaciones' });
    expect(classifyCompanyCell({ text: ' \n', fill: 'FFA9D0F5' })).toMatchObject({ type: 'Baja' });
    expect(classifyCompanyCell({ text: '11:00 \n19:00', fill: 'FFFFFFFE' })).toMatchObject({ type: 'Regular', start: '11:00', end: '19:00' });
    expect(classifyCompanyCell({ text: '5:00 \n13:00', fill: 'FFFFFFFE' })).toMatchObject({ start: '05:00' });
  });

  it('keeps the opaque "!" marker without interpreting it', () => {
    expect(classifyCompanyCell({ text: '17:00 \n01:00 \n!', fill: 'FFFFFFFE' }).marker).toBe('!');
  });

  it('treats an empty white cell as no company information and an unknown fill as unknown', () => {
    expect(classifyCompanyCell({ text: ' \n', fill: 'FFFFFFFE' })).toBeNull();
    expect(classifyCompanyCell({ text: ' \n', fill: 'FFFFFE' })).toBeNull();
    expect(classifyCompanyCell({ text: ' \n', fill: 'FF123456' })).toMatchObject({ type: 'UNKNOWN' });
  });
});

describe('reconcileDay — canonical acceptance dates', () => {
  it('2026-01-01: original Libre + personal change Regular 11-19 == current company -> HIGH', () => {
    const result = reconcileDay({
      date: '2026-01-01',
      company: { type: 'Regular', start: '11:00', end: '19:00' },
      rows: [row('pdf', 'Libre', null, null, 'PDF'), row('man', 'Regular', '11:00', '19:00', 'MAN')],
    });
    expect(result.confidence).toBe('HIGH');
    expect(state(result, 'pdf').state).toBe('SUPERSEDED');
    expect(state(result, 'man').state).toBe('ABSORBED');
    expect(result.insertRows).toHaveLength(1);
    expect(result.insertRows[0]).toMatchObject({ type: 'Regular', planRevision: 2, layer: 'COMPANY_PLAN' });
    expect(result.effectiveCandidate).toEqual([{ type: 'Regular', start: '11:00', end: '19:00' }]);
  });

  it('2026-02-06: Regular 13-20 + Extras 20-21 + JT 13-21 -> HIGH, JT metadata', () => {
    const result = reconcileDay({
      date: '2026-02-06',
      company: { type: 'Regular', start: '13:00', end: '20:00' },
      rows: [row('r', 'Regular', '13:00', '20:00'), row('x', 'Extras', '20:00', '21:00', 'MAN'), row('j', 'JT', '13:00', '21:00', 'MAN')],
    });
    expect(result.confidence).toBe('HIGH');
    expect(state(result, 'r')).toMatchObject({ state: 'EFFECTIVE', dutyRole: 'shift_lead' });
    expect(state(result, 'x').state).toBe('EFFECTIVE');
    expect(state(result, 'j')).toMatchObject({ state: 'METADATA_ONLY', dutyRole: 'shift_lead' });
    expect(result.insertRows).toHaveLength(0);
  });

  it('2026-02-18: Regular 13-21 + Extras 21-23:15 + JT 13-23:15 -> HIGH', () => {
    const result = reconcileDay({
      date: '2026-02-18',
      company: { type: 'Regular', start: '13:00', end: '21:00' },
      rows: [row('r', 'Regular', '13:00', '21:00'), row('x', 'Extras', '21:00', '23:15', 'MAN'), row('j', 'JT', '13:00', '23:15', 'MAN')],
    });
    expect(result.confidence).toBe('HIGH');
    expect(state(result, 'j').state).toBe('METADATA_ONLY');
    expect(state(result, 'x').state).toBe('EFFECTIVE');
  });

  it('2026-06-02: company Baja vs historical Regular 14-22 -> REQUIRES_REVIEW, nothing deleted', () => {
    const result = reconcileDay({
      date: '2026-06-02',
      company: { type: 'Baja' },
      rows: [row('r', 'Regular', '14:00', '22:00'), row('j', 'JT', '14:00', '22:00', 'MAN')],
    });
    expect(result.confidence).toBe('LOW');
    expect(result.recommendedAction).toBe('MARK_REQUIRES_REVIEW');
    expect(state(result, 'r').state).toBe('REQUIRES_REVIEW');
    expect(result.effectiveCandidate).toEqual([]);
    expect(result.issues.some((i) => i.code === 'COMPANY_NON_WORK_VS_HISTORICAL_WORK')).toBe(true);
    expect(result.insertRows[0]).toMatchObject({ type: 'Baja', state: 'REQUIRES_REVIEW' });
  });
});

describe('reconcileDay — other shapes', () => {
  it('exact single match needs no change', () => {
    const result = reconcileDay({ date: '2026-03-02', company: { type: 'Libre' }, rows: [row('a', 'Libre', null, null)] });
    expect(result.confidence).toBe('HIGH');
    expect(result.category).toBe('EXACT_MATCH');
    expect(state(result, 'a').state).toBe('EFFECTIVE');
  });

  it('a later company revision without personal evidence is MEDIUM (company Regular vs PDF Libre)', () => {
    const result = reconcileDay({
      date: '2026-03-03', company: { type: 'Regular', start: '08:00', end: '16:00' }, rows: [row('a', 'Libre', null, null)],
    });
    expect(result.confidence).toBe('MEDIUM');
    expect(state(result, 'a').state).toBe('REQUIRES_REVIEW');
    expect(result.effectiveCandidate).toEqual([{ type: 'Regular', start: '08:00', end: '16:00' }]);
  });

  it('a personal override that differs from the company is COMPANY_UPDATE_CONFLICTS_WITH_EFFECTIVE_OVERRIDE', () => {
    const result = reconcileDay({
      date: '2026-03-04', company: { type: 'Regular', start: '12:00', end: '20:00' },
      rows: [row('p', 'Regular', '12:00', '20:00'), row('m', 'Regular', '11:00', '19:00', 'MAN')],
    });
    expect(result.confidence).toBe('LOW');
    expect(result.issues.map((i) => i.code)).toContain('COMPANY_UPDATE_CONFLICTS_WITH_EFFECTIVE_OVERRIDE');
  });

  it('JT interval outside the effective span is MEDIUM (nothing is lost, JT stays as metadata)', () => {
    const result = reconcileDay({
      date: '2026-01-23', company: { type: 'Regular', start: '21:00', end: '03:00' },
      rows: [row('p', 'Regular', '21:00', '03:00'), row('j', 'JT', '19:00', '01:00', 'MAN')],
    });
    expect(result.confidence).toBe('MEDIUM');
    expect(result.issues.map((i) => i.code)).toContain('JT_INTERVAL_OUTSIDE_EFFECTIVE_SPAN');
  });

  it('JT-only day without company data is LOW, never invented work', () => {
    const result = reconcileDay({ date: '2025-05-05', company: null, rows: [row('j', 'JT', '08:00', '15:00', 'MAN')] });
    expect(result.confidence).toBe('LOW');
    expect(result.issues[0].code).toBe('JT_ONLY_DAY');
  });

  it('days without company data keep their rows (JT becomes metadata)', () => {
    const result = reconcileDay({
      date: '2026-11-20', company: null,
      rows: [row('s', 'Regular', '09:00', '17:00', null, 'schedule'), row('j', 'JT', '09:00', '17:00', 'MAN')],
    });
    expect(result.confidence).toBe('HIGH');
    expect(state(result, 'j').state).toBe('METADATA_ONLY');
  });

  it('a personal change equal to the company state, with no earlier plan row, becomes revision 1', () => {
    const result = reconcileDay({ date: '2026-04-10', company: { type: 'Vacaciones' }, rows: [row('v', 'Vacaciones', null, null, 'MAN')] });
    expect(result.confidence).toBe('HIGH');
    expect(result.insertRows[0].planRevision).toBe(1);
    expect(state(result, 'v').state).toBe('ABSORBED');
  });

  it('company day with no stored rows becomes the first plan revision', () => {
    const result = reconcileDay({ date: '2026-11-03', company: { type: 'Libre' }, rows: [] });
    expect(result.confidence).toBe('HIGH');
    expect(result.insertRows[0]).toMatchObject({ type: 'Libre', planRevision: 1 });
  });

  it('unknown company cell is LOW', () => {
    expect(reconcileDay({ date: '2026-05-05', company: { type: 'UNKNOWN', fill: '123456' }, rows: [] }).confidence).toBe('LOW');
  });
});

describe('legacy double counting', () => {
  it('JT 13-21 over Regular 13-20 + Extras 20-21 double counts 8h', () => {
    const { naive, union } = naiveAndUnionMinutes([
      { type: 'Regular', start: '13:00', end: '20:00' }, { type: 'Extras', start: '20:00', end: '21:00' }, { type: 'JT', start: '13:00', end: '21:00' },
    ]);
    expect(naive).toBe(960);
    expect(union).toBe(480);
  });
});
