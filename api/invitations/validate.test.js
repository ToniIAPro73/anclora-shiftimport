import { describe, expect, it } from 'vitest';
import handler from './validate.js';

function responseDouble() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    send(value) { this.body = value; return this; },
  };
}

describe('POST /api/invitations/validate', () => {
  it('rejects GET and applies non-cacheable, referrer-safe headers', async () => {
    const res = responseDouble();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.headers.Pragma).toBe('no-cache');
    expect(res.headers['Referrer-Policy']).toBe('no-referrer');
    expect(res.headers.Allow).toBe('POST');
  });

  it('does not query the database for an invalid token shape', async () => {
    const res = responseDouble();
    await handler({ method: 'POST', headers: {}, body: { token: 'short' } }, res);
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'This invitation is not available', code: 'INVITATION_INVALID' });
  });
});
