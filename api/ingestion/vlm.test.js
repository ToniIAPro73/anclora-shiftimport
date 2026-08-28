import { createHash } from 'node:crypto';
import {
  afterAll, beforeEach, describe, expect, it, vi,
} from 'vitest';

/**
 * api/ingestion/vlm handler tests. Same fake-sql style as
 * api/format-profiles/index.test.js: resolveContext runs for real against
 * the fake (sessions/memberships matched on SQL text substrings), and the
 * login_attempts table backs the org rate limiter. The VLM provider seam is
 * real too: VLM_PROVIDER=fake drives every behavior without mocking fetch.
 */

const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const TOKEN_ADMIN = 'tok-admin';
const TOKEN_EMPLOYEE = 'tok-employee';
const TOKEN_ADMIN_B = 'tok-admin-b';

const VLM_ENV_KEYS = [
  'VLM_PROVIDER', 'VLM_FAKE_BEHAVIOR', 'VLM_FAKE_DELAY_MS',
  'VLM_TIMEOUT_MS', 'VLM_MAX_PAGES', 'VLM_MAX_FILE_MB',
];
const savedEnv = Object.fromEntries(VLM_ENV_KEYS.map((key) => [key, process.env[key]]));

vi.mock('../_lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getSql: () => state.sql };
});

const { default: handler } = await import('./vlm.js');

let state;

function makeFakeSql() {
  const sessions = {
    [tokenHash(TOKEN_ADMIN)]: { user_id: 'user-admin', role: 'ADMIN', org: ORG_A },
    [tokenHash(TOKEN_EMPLOYEE)]: { user_id: 'user-emp', role: 'EMPLOYEE', org: ORG_A },
    [tokenHash(TOKEN_ADMIN_B)]: { user_id: 'user-admin-b', role: 'ADMIN', org: ORG_B },
  };
  const attempts = new Map();

  const sql = (strings, ...values) => {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim();

    if (text.includes('FROM sessions')) {
      const session = sessions[values[0]];
      return Promise.resolve(session ? [{ id: session.user_id, email: `${session.user_id}@example.com`, display_name: session.user_id }] : []);
    }
    if (text.includes('FROM memberships')) {
      const session = Object.values(sessions).find((s) => s.user_id === values[0]);
      return Promise.resolve([{
        organization_id: session.org,
        role: session.role,
        organization_name: `Org ${session.org}`,
        organization_plan: 'team',
      }]);
    }
    if (text.includes('FROM employees')) {
      return Promise.resolve([]);
    }

    // rate limiter over login_attempts (id_key is free-form)
    if (text.includes('FROM login_attempts')) {
      const row = attempts.get(values[0]);
      return Promise.resolve(row ? [row] : []);
    }
    if (text.startsWith('INSERT INTO login_attempts')) {
      attempts.set(values[0], { window_start: values[1], attempt_count: values[2] });
      return Promise.resolve([]);
    }

    return Promise.resolve([]);
  };
  return { sql, attempts };
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    send(payload) { this.body = JSON.parse(payload); return this; },
  };
}

const PNG_PAGE = { imageBase64: 'QUJD', mimeType: 'image/png' };

const call = async (method, {
  token = TOKEN_ADMIN, body, headers = {},
} = {}) => {
  const req = {
    method,
    body,
    query: {},
    headers: { cookie: token ? `anclora_session=${token}` : '', ...headers },
  };
  const res = mockRes();
  await handler(req, res);
  return res;
};

const post = (options = {}) => call('POST', { body: { pages: [PNG_PAGE] }, ...options });

beforeEach(() => {
  state = makeFakeSql();
  process.env.VLM_PROVIDER = 'fake';
  process.env.VLM_FAKE_BEHAVIOR = 'success';
  for (const key of ['VLM_FAKE_DELAY_MS', 'VLM_TIMEOUT_MS', 'VLM_MAX_PAGES', 'VLM_MAX_FILE_MB']) {
    delete process.env[key];
  }
});

afterAll(() => {
  for (const key of VLM_ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

describe('auth & tenancy', () => {
  it('rejects anonymous requests (401)', async () => {
    const res = await post({ token: null });
    expect(res.statusCode).toBe(401);
  });

  it('org isolation: a membership in org B cannot run with org A context (400, no silent fallback)', async () => {
    const res = await post({ token: TOKEN_ADMIN_B, headers: { 'x-organization-id': ORG_A } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Organization selection required/);
  });

  it('is usable by any authenticated role (EMPLOYEE included)', async () => {
    const res = await post({ token: TOKEN_EMPLOYEE });
    expect(res.statusCode).toBe(200);
  });
});

describe('payload validation (fail-closed, 400 VLM_INVALID_PAYLOAD)', () => {
  it('rejects a malformed body: missing/empty pages', async () => {
    for (const body of [{}, { pages: [] }, { pages: 'nope' }, null]) {
      const res = await call('POST', { body });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('VLM_INVALID_PAYLOAD');
    }
  });

  it('rejects more pages than VLM_MAX_PAGES (default 3)', async () => {
    const res = await call('POST', { body: { pages: [PNG_PAGE, PNG_PAGE, PNG_PAGE, PNG_PAGE] } });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VLM_INVALID_PAYLOAD');
  });

  it('rejects an unsupported mimeType', async () => {
    const res = await call('POST', { body: { pages: [{ imageBase64: 'QUJD', mimeType: 'application/pdf' }] } });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VLM_INVALID_PAYLOAD');
  });

  it('rejects invalid base64', async () => {
    const res = await call('POST', { body: { pages: [{ imageBase64: 'not base64!!', mimeType: 'image/png' }] } });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a page over VLM_MAX_FILE_MB (default 4MB decoded)', async () => {
    // 5_592_408 base64 chars decode to 4_194_306 bytes > 4 MiB.
    const big = 'A'.repeat(5_592_408);
    const res = await call('POST', { body: { pages: [{ imageBase64: big, mimeType: 'image/png' }] } });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VLM_INVALID_PAYLOAD');
  });

  it('rejects an out-of-range context month/year', async () => {
    const badMonth = await call('POST', { body: { pages: [PNG_PAGE], context: { month: 13 } } });
    expect(badMonth.statusCode).toBe(400);
    const badYear = await call('POST', { body: { pages: [PNG_PAGE], context: { year: 1999 } } });
    expect(badYear.statusCode).toBe(400);
  });
});

describe('org rate limit (10 requests / 60 min)', () => {
  it('allows 10 requests, then blocks with 429 VLM_RATE_LIMITED', async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await post();
      expect(res.statusCode).toBe(200);
    }
    const res = await post();
    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe('VLM_RATE_LIMITED');
  });

  it('is scoped per organization (org B is not affected by org A usage)', async () => {
    for (let i = 0; i < 10; i += 1) {
      await post();
    }
    const resB = await post({ token: TOKEN_ADMIN_B });
    expect(resB.statusCode).toBe(200);
  });
});

describe('provider behaviors (VLM_PROVIDER=fake)', () => {
  it('success: 200 with validated records and the stable client contract', async () => {
    const res = await post({ body: { pages: [PNG_PAGE], context: { month: 9, year: 2026 } } });
    expect(res.statusCode).toBe(200);
    expect(res.body.provider).toBe('vlm');
    expect(res.body.engine).toBe('vlm-fallback');
    expect(res.body.records.entries).toHaveLength(3);
    expect(res.body.records.entries[0].date).toMatch(/^2026-09-/);
    expect(res.body.usage).toEqual({ inputTokens: 1234, outputTokens: 56 });
    // internals must not leak
    expect(res.body.model).toBeUndefined();
  });

  it('malformed provider output → 502 VLM_INVALID_RESPONSE', async () => {
    process.env.VLM_FAKE_BEHAVIOR = 'malformed';
    const res = await post();
    expect(res.statusCode).toBe(502);
    expect(res.body.code).toBe('VLM_INVALID_RESPONSE');
  });

  it('provider timeout → 504 VLM_TIMEOUT', async () => {
    process.env.VLM_FAKE_BEHAVIOR = 'timeout';
    process.env.VLM_TIMEOUT_MS = '50';
    const res = await post();
    expect(res.statusCode).toBe(504);
    expect(res.body.code).toBe('VLM_TIMEOUT');
  });

  it('provider throttling → 429 VLM_RATE_LIMITED', async () => {
    process.env.VLM_FAKE_BEHAVIOR = 'rate-limited';
    const res = await post();
    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe('VLM_RATE_LIMITED');
  });

  it('provider failure → 502 VLM_PROVIDER_ERROR', async () => {
    process.env.VLM_FAKE_BEHAVIOR = 'provider-error';
    const res = await post();
    expect(res.statusCode).toBe(502);
    expect(res.body.code).toBe('VLM_PROVIDER_ERROR');
  });
});

describe('fake-behavior header overrides (dev/test only, VLM_PROVIDER=fake)', () => {
  it('x-vlm-fake-behavior overrides VLM_FAKE_BEHAVIOR for that request', async () => {
    const res = await post({ headers: { 'x-vlm-fake-behavior': 'provider-error' } });
    expect(res.statusCode).toBe(502);
    expect(res.body.code).toBe('VLM_PROVIDER_ERROR');
    // The env behavior is untouched: the next request without the header succeeds.
    const next = await post();
    expect(next.statusCode).toBe(200);
  });

  it('x-vlm-fake-delay-ms overrides VLM_FAKE_DELAY_MS for that request', async () => {
    const started = Date.now();
    const res = await post({ headers: { 'x-vlm-fake-delay-ms': '60' } });
    expect(res.statusCode).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(50);
  });

  it('ignores unknown behavior values and non-numeric delays', async () => {
    const res = await post({
      headers: { 'x-vlm-fake-behavior': 'bogus', 'x-vlm-fake-delay-ms': '-5' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('has NO effect with a real provider configured', async () => {
    process.env.VLM_PROVIDER = 'openai-compatible';
    delete process.env.VLM_API_URL;
    delete process.env.VLM_API_KEY;
    delete process.env.VLM_MODEL;
    const res = await post({ headers: { 'x-vlm-fake-behavior': 'success' } });
    // Unconfigured real provider → 503, never the fake success payload.
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('VLM_UNAVAILABLE');
    process.env.VLM_PROVIDER = 'fake';
  });
});

describe('other methods', () => {
  it('GET is not supported (405 + Allow)', async () => {
    const res = await call('GET');
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('POST');
  });
});
