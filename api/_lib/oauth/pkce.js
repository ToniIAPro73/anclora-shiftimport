import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

function randomBase64Url() {
  return randomBytes(32).toString('base64url');
}

/** PKCE transaction for one OAuth login attempt: anti-CSRF `state` plus a
 * `code_verifier`/`code_challenge` (S256) pair. */
export function createOAuthTransaction() {
  const state = randomBase64Url();
  const codeVerifier = randomBase64Url();
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { state, codeVerifier, codeChallenge };
}

/** Constant-time comparison of the `state` echoed by the provider against
 * the one stored in the transaction cookie. */
export function oauthStatesMatch(expectedState, receivedState) {
  if (!receivedState) {
    return false;
  }
  const expected = Buffer.from(expectedState, 'utf8');
  const received = Buffer.from(receivedState, 'utf8');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export const OAUTH_TRANSACTION_TTL_MS = 10 * 60 * 1000;

export function oauthTransactionCookieName(provider) {
  return `anclora_shiftimport_${provider}_oauth`;
}

export function encodeOAuthTransaction(transaction, now = Date.now()) {
  const payload = {
    state: transaction.state,
    codeVerifier: transaction.codeVerifier,
    expiresAt: now + OAUTH_TRANSACTION_TTL_MS,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/** Decodes and validates the transaction cookie. Returns `null` for any
 * malformed or expired payload — the caller treats that as an invalid
 * OAuth state and bounces the user back to sign-in. */
export function decodeOAuthTransaction(value, now = Date.now()) {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      typeof parsed?.state !== 'string' || !parsed.state ||
      typeof parsed?.codeVerifier !== 'string' || !parsed.codeVerifier ||
      typeof parsed?.expiresAt !== 'number' || parsed.expiresAt <= now
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function oauthTransactionCookieHeader(req, provider, transaction) {
  const secure = req.headers?.['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  const value = encodeOAuthTransaction(transaction);
  const maxAge = Math.floor(OAUTH_TRANSACTION_TTL_MS / 1000);
  return `${oauthTransactionCookieName(provider)}=${value}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${maxAge}`;
}

export function clearOAuthTransactionCookieHeader(req, provider) {
  const secure = req.headers?.['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${oauthTransactionCookieName(provider)}=; Path=/; HttpOnly; SameSite=Lax${secure}; Expires=${new Date(0).toUTCString()}`;
}

export function parseOAuthTransactionCookie(req, provider) {
  const header = String(req.headers?.cookie ?? '');
  const name = oauthTransactionCookieName(provider);
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      return decodeOAuthTransaction(decodeURIComponent(rest.join('=')));
    }
  }
  return null;
}
