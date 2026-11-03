import { describe, expect, it } from 'vitest';
import { plannerCounts } from './planner-counts';

const ok = { staleAgainstCalendar: false, excludedFromPublication: false };
const staleDraft = { staleAgainstCalendar: true, excludedFromPublication: false };
const excluded = { staleAgainstCalendar: true, excludedFromPublication: true };

describe('plannerCounts (F4-FIX-01)', () => {
  it('1. two publishable assignments in a published version: 2 published, 0 excluded', () => {
    expect(plannerCounts('PUBLISHED', [ok, ok])).toEqual({ mode: 'published', published: 2, excluded: 0 });
  });

  it('2. one publishable and one stale: 1 published, 1 excluded', () => {
    expect(plannerCounts('PUBLISHED', [ok, excluded])).toEqual({ mode: 'published', published: 1, excluded: 1 });
  });

  it('3. a single stale assignment: 0 published, 1 excluded', () => {
    expect(plannerCounts('PUBLISHED', [excluded])).toEqual({ mode: 'published', published: 0, excluded: 1 });
  });

  it('4. a DRAFT counts planned assignments (and flags the outdated ones), never publication results', () => {
    expect(plannerCounts('DRAFT', [ok, staleDraft])).toEqual({ mode: 'draft', planned: 2, stale: 1 });
  });

  it('5. an exclusion inherited into a new version is not published: the server flags it, the count follows the server', () => {
    // a new DRAFT copy is stale again; once published it is excluded again (same derivation), never counted as published
    expect(plannerCounts('DRAFT', [staleDraft])).toEqual({ mode: 'draft', planned: 1, stale: 1 });
    expect(plannerCounts('PUBLISHED', [excluded])).toEqual({ mode: 'published', published: 0, excluded: 1 });
  });

  it('6. Regular + compatible Extras are no false exclusions', () => {
    expect(plannerCounts('PUBLISHED', [ok, ok])).toMatchObject({ published: 2, excluded: 0 });
  });

  it('is not total minus stale: an assignment excluded for another reason is excluded, and a stale flag on a materialized one does not exclude it', () => {
    expect(plannerCounts('PUBLISHED', [{ staleAgainstCalendar: false, excludedFromPublication: true }, ok])).toMatchObject({ published: 1, excluded: 1 });
    expect(plannerCounts('LOCKED', [{ staleAgainstCalendar: true, excludedFromPublication: false }])).toMatchObject({ published: 1, excluded: 0 });
  });
});
