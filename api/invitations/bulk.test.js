import { describe, expect, it } from 'vitest';
import handler from './bulk.js';
import { mapWithConcurrency } from './bulk.js';

function responseDouble() {
  return {
    statusCode: null, headers: {}, body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    send(value) { this.body = value; return this; },
  };
}

describe('bulk invitation worker', () => {
  it('rejects non-POST without opening a database connection', async () => {
    const res = responseDouble();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('keeps bounded concurrency and preserves input order', async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return value * 2;
    }, 2);
    expect(result).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});
