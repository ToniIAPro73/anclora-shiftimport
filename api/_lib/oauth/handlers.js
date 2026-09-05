import { createSession, getSql, sessionCookieHeader } from '../auth.js';
import { getClientIp, recordKeyAttempt } from '../rate-limit.js';
import { loginWithExternalIdentity } from './identity.js';
import { createOAuthTransaction, oauthStatesMatch, oauthTransactionCookieHeader, clearOAuthTransactionCookieHeader, parseOAuthTransactionCookie } from './pkce.js';
import { readProviderOAuthConfig } from './config.js';
import { createProviderAuthorizationUrl, resolveProviderOAuthIdentity } from './providers.js';

const RATE_LIMIT_WINDOW_MINUTES = 5;
const RATE_LIMIT_MAX_ATTEMPTS = 20;

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

export function createOAuthStartHandler(provider) {
  return async function handler(req, res) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).end();
      return;
    }

    const sql = getSql();
    const rateKey = `oauth-start:${getClientIp(req)}`;
    const allowed = await recordKeyAttempt(sql, rateKey, {
      windowMinutes: RATE_LIMIT_WINDOW_MINUTES,
      maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
    });
    if (!allowed) {
      res.status(429).end();
      return;
    }

    let config;
    try {
      config = readProviderOAuthConfig(provider);
    } catch (error) {
      console.error(`[auth-oauth] ${provider} misconfigured`, error instanceof Error ? error.message : error);
      res.status(503).end();
      return;
    }
    if (!config) {
      res.status(503).end();
      return;
    }

    const transaction = createOAuthTransaction();
    const authorizationUrl = createProviderAuthorizationUrl(provider, config, transaction);
    res.setHeader('Set-Cookie', oauthTransactionCookieHeader(req, provider, transaction));
    redirect(res, authorizationUrl);
  };
}

export function createOAuthCallbackHandler(provider) {
  return async function handler(req, res) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).end();
      return;
    }

    const sql = getSql();
    const clearCookie = clearOAuthTransactionCookieHeader(req, provider);

    const fail = (reason) => {
      res.setHeader('Set-Cookie', clearCookie);
      redirect(res, `/login?oauth=${provider}_${reason}`);
    };

    const rateKey = `oauth-callback:${getClientIp(req)}`;
    const allowed = await recordKeyAttempt(sql, rateKey, {
      windowMinutes: RATE_LIMIT_WINDOW_MINUTES,
      maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
    });
    if (!allowed) {
      res.setHeader('Set-Cookie', clearCookie);
      res.status(429).end();
      return;
    }

    const query = new URL(req.url, 'http://internal').searchParams;

    if (query.get('error')) {
      fail('cancelled');
      return;
    }

    const transaction = parseOAuthTransactionCookie(req, provider);
    if (!transaction) {
      fail('invalid_state');
      return;
    }

    const code = query.get('code');
    const state = query.get('state') ?? undefined;
    if (!code || !oauthStatesMatch(transaction.state, state)) {
      fail('invalid_state');
      return;
    }

    let config;
    try {
      config = readProviderOAuthConfig(provider);
    } catch (error) {
      console.error(`[auth-oauth] ${provider} misconfigured`, error instanceof Error ? error.message : error);
      res.setHeader('Set-Cookie', clearCookie);
      res.status(503).end();
      return;
    }
    if (!config) {
      res.setHeader('Set-Cookie', clearCookie);
      res.status(503).end();
      return;
    }

    try {
      const identity = await resolveProviderOAuthIdentity(provider, config, {
        code,
        codeVerifier: transaction.codeVerifier,
      });
      const user = await loginWithExternalIdentity(sql, identity);
      const { token, expiresAt } = await createSession(sql, user.id);

      res.setHeader('Set-Cookie', [sessionCookieHeader(req, token, expiresAt), clearCookie]);
      redirect(res, '/app');
    } catch (error) {
      console.error(`[auth-oauth] ${provider} callback failed`, error instanceof Error ? error.message : 'unknown error');
      fail('error');
    }
  };
}
