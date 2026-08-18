import { describe, expect, it } from 'vitest';
import { compareTimes, durationMinutes, isOvernight, parseHHMM } from './time';

describe('parseHHMM', () => {
  it('parses HH:mm to minutes since midnight', () => {
    expect(parseHHMM('08:30')).toBe(510);
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('23:59')).toBe(1439);
  });

  it('treats missing minutes as zero', () => {
    expect(parseHHMM('09:00')).toBe(540);
  });
});

describe('compareTimes', () => {
  it('orders HH:mm strings', () => {
    expect(compareTimes('08:00', '14:00')).toBe(-1);
    expect(compareTimes('22:00', '06:00')).toBe(1);
    expect(compareTimes('09:30', '09:30')).toBe(0);
  });
});

describe('durationMinutes', () => {
  it('computes same-day durations', () => {
    expect(durationMinutes('08:00', '14:00')).toBe(360);
  });

  it('computes midnight-crossover durations', () => {
    expect(durationMinutes('22:00', '06:00')).toBe(480);
    expect(durationMinutes('17:00', '01:00')).toBe(480);
  });

  it('computes exact 24h duration for 00:00-00:00', () => {
    expect(durationMinutes('00:00', '00:00')).toBe(1440);
  });
});

describe('isOvernight', () => {
  it('detects shifts crossing midnight', () => {
    expect(isOvernight('22:00', '06:00')).toBe(true);
    expect(isOvernight('17:00', '01:00')).toBe(true);
    expect(isOvernight('08:00', '14:00')).toBe(false);
  });
});
