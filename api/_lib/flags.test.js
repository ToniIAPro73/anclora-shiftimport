import { describe, expect, it } from 'vitest';
import { isTimeOffEnabled } from './flags.js';

describe('isTimeOffEnabled (TIME_OFF_ENABLED)', () => {
  it('is OFF by default and for anything that is not literally "true"', () => {
    expect(isTimeOffEnabled({})).toBe(false);
    for (const value of ['', 'false', '0', '1', 'yes', 'on', 'TRUE_ISH', undefined, null]) {
      expect(isTimeOffEnabled({ TIME_OFF_ENABLED: value })).toBe(false);
    }
  });

  it('is ON only for "true" (any case, surrounding whitespace tolerated)', () => {
    for (const value of ['true', 'TRUE', ' True ']) expect(isTimeOffEnabled({ TIME_OFF_ENABLED: value })).toBe(true);
  });

  it('reads process.env by default and does not depend on the client flag', () => {
    const previous = process.env.TIME_OFF_ENABLED;
    process.env.VITE_TIME_OFF_ENABLED = 'true';
    delete process.env.TIME_OFF_ENABLED;
    expect(isTimeOffEnabled()).toBe(false);
    process.env.TIME_OFF_ENABLED = 'true';
    expect(isTimeOffEnabled()).toBe(true);
    if (previous === undefined) delete process.env.TIME_OFF_ENABLED; else process.env.TIME_OFF_ENABLED = previous;
    delete process.env.VITE_TIME_OFF_ENABLED;
  });
});
