/**
 * Fase 1.2E: distributed login rate limiting, Neon-backed (replaces the
 * naive per-warm-instance in-memory limiter, which reset on every cold
 * start and was invisible across concurrent instances). One row per
 * identity key (ip:<addr> or email:<normalized>) in `login_attempts`.
 *
 * Only failed login attempts count against the limit; a successful login
 * clears both the IP and email counters — a legitimate user is never
 * punished for someone else's earlier mistakes on a shared identity (e.g.
 * an office IP), nor for their own eventually-correct password.
 */

/** Pure: is this identity currently blocked, given its stored row (or
 * undefined if none exists yet)? No I/O — fully unit-testable. */
export function isCurrentlyBlocked(row, { windowMs, maxAttempts, now = Date.now() }) {
  if (!row) {
    return false;
  }
  const expired = now - new Date(row.window_start).getTime() > windowMs;
  if (expired) {
    return false;
  }
  return row.attempt_count >= maxAttempts;
}

/** Pure: given the current row and a new failed attempt happening now,
 * compute the row's next persisted state. If already blocked, the row is
 * left untouched (no unbounded counter growth). */
export function evaluateFailedAttempt(row, { windowMs, maxAttempts, now = Date.now() }) {
  if (isCurrentlyBlocked(row, { windowMs, maxAttempts, now })) {
    return { limited: true, windowStart: row.window_start, attemptCount: row.attempt_count };
  }
  const expired = !row || now - new Date(row.window_start).getTime() > windowMs;
  return {
    limited: false,
    windowStart: expired ? new Date(now).toISOString() : row.window_start,
    attemptCount: expired ? 1 : row.attempt_count + 1,
  };
}

export async function isLoginBlocked(sql, key, options) {
  const rows = await sql`SELECT window_start, attempt_count FROM login_attempts WHERE id_key = ${key}`;
  return isCurrentlyBlocked(rows[0], options);
}

export async function recordFailedLogin(sql, key, options) {
  const rows = await sql`SELECT window_start, attempt_count FROM login_attempts WHERE id_key = ${key}`;
  const next = evaluateFailedAttempt(rows[0], options);
  if (next.limited) {
    return;
  }
  await sql`
    INSERT INTO login_attempts (id_key, window_start, attempt_count)
    VALUES (${key}, ${next.windowStart}, ${next.attemptCount})
    ON CONFLICT (id_key) DO UPDATE SET window_start = EXCLUDED.window_start, attempt_count = EXCLUDED.attempt_count
  `;
}

export async function clearLoginAttempts(sql, key) {
  await sql`DELETE FROM login_attempts WHERE id_key = ${key}`;
}

/** First hop in x-forwarded-for is the original client (Vercel sets this
 * at the edge); falls back to the raw socket address, then 'unknown'. */
export function getClientIp(req) {
  const forwarded = String(req.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}
