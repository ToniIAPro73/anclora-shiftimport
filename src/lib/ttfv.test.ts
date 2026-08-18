import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import {
  clearTtfvEvents,
  computeTtfvMs,
  getTtfvEvents,
  trackTtfvEvent,
} from './ttfv';

setupLocalStorageMock();

describe('ttfv', () => {
  it('records events in order with their timestamps', () => {
    trackTtfvEvent('onboarding_started', 1000);
    trackTtfvEvent('document_selected', 2000);
    trackTtfvEvent('preview_ready', 5000);
    expect(getTtfvEvents()).toEqual([
      { name: 'onboarding_started', at: 1000 },
      { name: 'document_selected', at: 2000 },
      { name: 'preview_ready', at: 5000 },
    ]);
  });

  it('dedupes consecutive same-name events but keeps non-consecutive ones', () => {
    trackTtfvEvent('document_selected', 1000);
    trackTtfvEvent('document_selected', 1500);
    trackTtfvEvent('preview_ready', 2000);
    trackTtfvEvent('document_selected', 3000);
    expect(getTtfvEvents().map((event) => event.name)).toEqual([
      'document_selected',
      'preview_ready',
      'document_selected',
    ]);
  });

  it('caps stored events at 100, dropping the oldest', () => {
    for (let i = 0; i < 120; i += 1) {
      // alternate names so dedupe does not collapse the sequence
      trackTtfvEvent(i % 2 === 0 ? 'document_selected' : 'preview_ready', i);
    }
    const events = getTtfvEvents();
    expect(events).toHaveLength(100);
    expect(events[0].at).toBe(20);
    expect(events[events.length - 1].at).toBe(119);
  });

  it('clearTtfvEvents empties the store', () => {
    trackTtfvEvent('onboarding_started', 1000);
    clearTtfvEvents();
    expect(getTtfvEvents()).toEqual([]);
  });

  it('computes TTFV from onboarding_started to preview_ready', () => {
    const events = [
      { name: 'onboarding_started' as const, at: 1000 },
      { name: 'document_selected' as const, at: 2000 },
      { name: 'preview_ready' as const, at: 6500 },
    ];
    expect(computeTtfvMs(events)).toBe(5500);
  });

  it('falls back to document_selected when there was no onboarding', () => {
    const events = [
      { name: 'document_selected' as const, at: 2000 },
      { name: 'preview_ready' as const, at: 4500 },
    ];
    expect(computeTtfvMs(events)).toBe(2500);
  });

  it('returns null when an endpoint is missing', () => {
    expect(computeTtfvMs([])).toBeNull();
    expect(computeTtfvMs([{ name: 'onboarding_started', at: 1000 }])).toBeNull();
    expect(computeTtfvMs([{ name: 'preview_ready', at: 1000 }])).toBeNull();
  });

  it('reads from storage when no events are passed explicitly', () => {
    trackTtfvEvent('onboarding_started', 1000);
    trackTtfvEvent('preview_ready', 4000);
    expect(computeTtfvMs()).toBe(3000);
  });
});
