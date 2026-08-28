import { describe, expect, it } from 'vitest';
import {
  evaluateFailedAttempt, isCurrentlyBlocked, getClientIp, isKeyBlocked, recordKeyAttempt,
} from './rate-limit.js';

const CONFIG = { windowMs: 5 * 60 * 1000, maxAttempts: 3 };
const T0 = Date.parse('2026-01-01T00:00:00Z');

describe('isCurrentlyBlocked', () => {
  it('is not blocked with no prior row', () => {
    expect(isCurrentlyBlocked(undefined, { ...CONFIG, now: T0 })).toBe(false);
  });

  it('is not blocked below the threshold', () => {
    const row = { window_start: new Date(T0).toISOString(), attempt_count: 2 };
    expect(isCurrentlyBlocked(row, { ...CONFIG, now: T0 + 1000 })).toBe(false);
  });

  it('is blocked once the count reaches the threshold within the window', () => {
    const row = { window_start: new Date(T0).toISOString(), attempt_count: 3 };
    expect(isCurrentlyBlocked(row, { ...CONFIG, now: T0 + 1000 })).toBe(true);
  });

  it('expiration: an old window no longer blocks, even over threshold', () => {
    const row = { window_start: new Date(T0).toISOString(), attempt_count: 99 };
    const now = T0 + CONFIG.windowMs + 1;
    expect(isCurrentlyBlocked(row, { ...CONFIG, now })).toBe(false);
  });
});

describe('evaluateFailedAttempt', () => {
  it('allowed: starts a fresh window at count 1 with no prior row', () => {
    const next = evaluateFailedAttempt(undefined, { ...CONFIG, now: T0 });
    expect(next).toEqual({ limited: false, windowStart: new Date(T0).toISOString(), attemptCount: 1 });
  });

  it('allowed: increments within an active window below threshold', () => {
    const row = { window_start: new Date(T0).toISOString(), attempt_count: 1 };
    const next = evaluateFailedAttempt(row, { ...CONFIG, now: T0 + 1000 });
    expect(next).toEqual({ limited: false, windowStart: row.window_start, attemptCount: 2 });
  });

  it('blocked: refuses to record once the count is already at the threshold', () => {
    const row = { window_start: new Date(T0).toISOString(), attempt_count: 3 };
    const next = evaluateFailedAttempt(row, { ...CONFIG, now: T0 + 1000 });
    expect(next).toEqual({ limited: true, windowStart: row.window_start, attemptCount: 3 });
  });

  it('expiration: a new attempt after the window elapsed resets to count 1, never carries the old count', () => {
    const row = { window_start: new Date(T0).toISOString(), attempt_count: 99 };
    const now = T0 + CONFIG.windowMs + 1;
    const next = evaluateFailedAttempt(row, { ...CONFIG, now });
    expect(next).toEqual({ limited: false, windowStart: new Date(now).toISOString(), attemptCount: 1 });
  });

  it('isolation between identities: two independent keys never share state (same config, different rows)', () => {
    const ipRow = { window_start: new Date(T0).toISOString(), attempt_count: 3 };
    const emailRow = undefined;
    expect(evaluateFailedAttempt(ipRow, { ...CONFIG, now: T0 + 1000 }).limited).toBe(true);
    expect(evaluateFailedAttempt(emailRow, { ...CONFIG, now: T0 + 1000 }).limited).toBe(false);
  });
});

describe('getClientIp', () => {
  it('takes the first hop of x-forwarded-for', () => {
    expect(getClientIp({ headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } })).toBe('203.0.113.9');
  });

  it('falls back to the socket address, then unknown', () => {
    expect(getClientIp({ headers: {}, socket: { remoteAddress: '198.51.100.4' } })).toBe('198.51.100.4');
    expect(getClientIp({ headers: {} })).toBe('unknown');
  });
});

describe('generic key limiter (isKeyBlocked / recordKeyAttempt)', () => {
  const LIMIT = { windowMinutes: 60, maxAttempts: 3 };

  function makeFakeSql() {
    const rows = new Map();
    const sql = (strings, ...values) => {
      const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();
      if (text.includes('FROM login_attempts')) {
        const row = rows.get(values[0]);
        return Promise.resolve(row ? [row] : []);
      }
      if (text.startsWith('INSERT INTO login_attempts')) {
        rows.set(values[0], { window_start: values[1], attempt_count: values[2] });
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    };
    return { sql, rows };
  }

  it('is not blocked for an unknown key', async () => {
    const { sql } = makeFakeSql();
    expect(await isKeyBlocked(sql, 'vlm:org:a', LIMIT)).toBe(false);
  });

  it('counts attempts and blocks at the threshold', async () => {
    const { sql } = makeFakeSql();
    expect(await recordKeyAttempt(sql, 'vlm:org:a', LIMIT)).toBe(true);
    expect(await recordKeyAttempt(sql, 'vlm:org:a', LIMIT)).toBe(true);
    expect(await isKeyBlocked(sql, 'vlm:org:a', LIMIT)).toBe(false);
    expect(await recordKeyAttempt(sql, 'vlm:org:a', LIMIT)).toBe(true);
    expect(await isKeyBlocked(sql, 'vlm:org:a', LIMIT)).toBe(true);
    // already-limited keys are not written again (no unbounded growth)
    expect(await recordKeyAttempt(sql, 'vlm:org:a', LIMIT)).toBe(false);
  });

  it('keeps independent keys isolated', async () => {
    const { sql } = makeFakeSql();
    for (let i = 0; i < 3; i += 1) {
      await recordKeyAttempt(sql, 'vlm:org:a', LIMIT);
    }
    expect(await isKeyBlocked(sql, 'vlm:org:a', LIMIT)).toBe(true);
    expect(await isKeyBlocked(sql, 'vlm:org:b', LIMIT)).toBe(false);
  });
});
