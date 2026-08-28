import { randomUUID } from 'node:crypto';
import { getSql, requireOrgContext, resolveContext } from '../_lib/auth.js';
import { handleError, sendJson } from '../_lib/http.js';
import { isKeyBlocked, recordKeyAttempt } from '../_lib/rate-limit.js';
import { createVlmProvider, VlmError } from '../_lib/vlm/provider.js';

/**
 * POST /api/ingestion/vlm — server-side VLM fallback for degraded PDF/image
 * ingestion. Authenticated (any role), org-scoped, rate-limited to
 * 10 requests / 60 min per organization (key `vlm:org:<id>`).
 *
 * Request:  { pages: [{ imageBase64, mimeType }], context?: { month?, year? } }
 * Success:  200 { records, usage, provider: 'vlm', engine: 'vlm-fallback' }
 *           (`records` is the validated extraction payload; `provider` is the
 *           literal 'vlm' — the real provider/model never leak to clients).
 * Errors:   400 VLM_INVALID_PAYLOAD · 401 unauthenticated ·
 *           429 VLM_RATE_LIMITED · 502 VLM_INVALID_RESPONSE/VLM_PROVIDER_ERROR
 *           · 503 VLM_UNAVAILABLE · 504 VLM_TIMEOUT
 */

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const RATE_LIMIT = { windowMinutes: 60, maxAttempts: 10 };
// Early reject on the base64 string lengths (~4/3 of decoded bytes).
const MAX_TOTAL_BASE64_CHARS = 12 * 1024 * 1024;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function readPositiveIntEnv(env, name, fallback) {
  const parsed = Number.parseInt(env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Decoded byte size from a canonical base64 string (length % 4 === 0). */
function decodedSize(base64) {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

const invalid = (reason) => ({ ok: false, reason });

// Dev/test-only seam (visual QA, E2E): ONLY when VLM_PROVIDER=fake, the
// request headers `x-vlm-fake-behavior` / `x-vlm-fake-delay-ms` override
// VLM_FAKE_BEHAVIOR / VLM_FAKE_DELAY_MS for that single request, so every
// fake behavior can be exercised without restarting the server. With a real
// provider configured, the headers are ignored entirely.
const FAKE_BEHAVIORS = new Set(['success', 'partial', 'malformed', 'timeout', 'rate-limited', 'provider-error']);

function providerEnvForRequest(req) {
  if ((process.env.VLM_PROVIDER || 'openai-compatible') !== 'fake') {
    return process.env;
  }
  const behavior = req.headers?.['x-vlm-fake-behavior'];
  const delayMs = req.headers?.['x-vlm-fake-delay-ms'];
  const env = { ...process.env };
  if (typeof behavior === 'string' && FAKE_BEHAVIORS.has(behavior)) {
    env.VLM_FAKE_BEHAVIOR = behavior;
  }
  if (typeof delayMs === 'string' && /^\d+$/.test(delayMs)) {
    env.VLM_FAKE_DELAY_MS = delayMs;
  }
  return env;
}

/** Fail-closed payload validation. Returns { ok, pages, hint, bytes }. */
function parsePayload(rawBody, { maxPages, maxFileBytes }) {
  let body = rawBody;
  if (typeof body === 'string' && body.length > 0) {
    try {
      body = JSON.parse(body);
    } catch {
      return invalid('body must be a JSON object');
    }
  }
  if (!isPlainObject(body)) {
    return invalid('body must be a JSON object');
  }

  const { pages, context } = body;
  if (!Array.isArray(pages) || pages.length < 1) {
    return invalid('pages must be a non-empty array');
  }
  if (pages.length > maxPages) {
    return invalid(`pages exceeds the maximum of ${maxPages}`);
  }

  const totalBase64Chars = pages.reduce(
    (sum, page) => sum + (typeof page?.imageBase64 === 'string' ? page.imageBase64.length : 0),
    0,
  );
  if (totalBase64Chars > MAX_TOTAL_BASE64_CHARS) {
    return invalid('payload exceeds the maximum total size');
  }

  let bytes = 0;
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (!isPlainObject(page)) {
      return invalid(`pages[${index}] must be an object`);
    }
    if (!ALLOWED_MIME_TYPES.has(page.mimeType)) {
      return invalid(`pages[${index}].mimeType must be one of: ${[...ALLOWED_MIME_TYPES].join(', ')}`);
    }
    const { imageBase64 } = page;
    if (typeof imageBase64 !== 'string'
      || imageBase64.length === 0
      || imageBase64.length % 4 !== 0
      || !BASE64_RE.test(imageBase64)) {
      return invalid(`pages[${index}].imageBase64 must be valid base64`);
    }
    const size = decodedSize(imageBase64);
    if (size > maxFileBytes) {
      return invalid(`pages[${index}] exceeds the maximum file size`);
    }
    bytes += size;
  }

  const hint = {};
  if (context !== undefined) {
    if (!isPlainObject(context)) {
      return invalid('context must be an object');
    }
    const { month, year } = context;
    if (month !== undefined) {
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        return invalid('context.month must be an integer between 1 and 12');
      }
      hint.month = month;
    }
    if (year !== undefined) {
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return invalid('context.year must be an integer between 2000 and 2100');
      }
      hint.year = year;
    }
  }

  return { ok: true, pages, hint, bytes };
}

export default async function handler(req, res) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  let orgId = null;
  let mimePages = 0;
  let bytes = 0;
  // Structured, PII-free observability: never log base64, keys or prompts.
  const log = (extra) => console.log(JSON.stringify({
    event: 'vlm_fallback',
    requestId,
    orgId,
    mimePages,
    bytes,
    durationMs: Date.now() - startedAt,
    ...extra,
  }));

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const sql = getSql();
    const ctx = requireOrgContext(await resolveContext(req, sql));
    orgId = ctx.organizationId;

    const rateKey = `vlm:org:${ctx.organizationId}`;
    if (await isKeyBlocked(sql, rateKey, RATE_LIMIT)) {
      log({ status: 429, records: 0, usage: null });
      return sendJson(res, 429, { error: 'VLM fallback rate limit reached', code: 'VLM_RATE_LIMITED' });
    }
    await recordKeyAttempt(sql, rateKey, RATE_LIMIT);

    const config = {
      maxPages: readPositiveIntEnv(process.env, 'VLM_MAX_PAGES', 3),
      maxFileBytes: readPositiveIntEnv(process.env, 'VLM_MAX_FILE_MB', 4) * 1024 * 1024,
      timeoutMs: readPositiveIntEnv(process.env, 'VLM_TIMEOUT_MS', 30000),
    };

    const parsed = parsePayload(req.body, config);
    if (!parsed.ok) {
      return sendJson(res, 400, { error: parsed.reason, code: 'VLM_INVALID_PAYLOAD' });
    }
    mimePages = parsed.pages.length;
    bytes = parsed.bytes;

    const provider = createVlmProvider(providerEnvForRequest(req));
    const result = await provider.analyze({
      pages: parsed.pages,
      hint: parsed.hint,
      timeoutMs: config.timeoutMs,
    });

    const recordCount = Array.isArray(result.records?.entries) ? result.records.entries.length : 0;
    log({ status: 200, records: recordCount, usage: result.usage ?? null });
    return sendJson(res, 200, {
      records: result.records,
      usage: result.usage ?? null,
      provider: 'vlm',
      engine: 'vlm-fallback',
    });
  } catch (error) {
    if (error instanceof VlmError) {
      log({ status: error.status, records: 0, usage: null });
      return sendJson(res, error.status, { error: error.message, code: error.code });
    }
    return handleError(res, error);
  }
}
