export const OAUTH_PROVIDERS = ['google', 'github'];

export function parseOAuthProvider(value) {
  return OAUTH_PROVIDERS.includes(value) ? value : null;
}

const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_LOGIN_SCOPE = 'openid email profile';
const GOOGLE_ACCESS_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

const GITHUB_AUTHORIZATION_ENDPOINT = 'https://github.com/login/oauth/authorize';
const GITHUB_LOGIN_SCOPE = 'read:user user:email';
const GITHUB_ACCESS_TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_ENDPOINT = 'https://api.github.com/user';
const GITHUB_EMAILS_ENDPOINT = 'https://api.github.com/user/emails';

export function createProviderAuthorizationUrl(provider, config, transaction) {
  const isGoogle = provider === 'google';
  const url = new URL(isGoogle ? GOOGLE_AUTHORIZATION_ENDPOINT : GITHUB_AUTHORIZATION_ENDPOINT);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.callbackUrl);
  url.searchParams.set('scope', isGoogle ? GOOGLE_LOGIN_SCOPE : GITHUB_LOGIN_SCOPE);
  url.searchParams.set('state', transaction.state);
  url.searchParams.set('code_challenge', transaction.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (isGoogle) {
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'select_account');
  }
  return url.toString();
}

async function exchangeGoogleCode(config, input) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: input.code,
    redirect_uri: config.callbackUrl,
    grant_type: 'authorization_code',
    code_verifier: input.codeVerifier,
  });
  const response = await fetch(GOOGLE_ACCESS_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    throw new Error('Google OAuth token exchange failed');
  }
  const parsed = await response.json();
  if (typeof parsed?.access_token !== 'string' || !parsed.access_token) {
    throw new Error('Google OAuth returned an invalid token response');
  }
  return parsed.access_token;
}

async function resolveGoogleIdentity(config, input) {
  const accessToken = await exchangeGoogleCode(config, input);
  const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error('Google OAuth user lookup failed');
  }
  const user = await response.json();
  if (typeof user?.sub !== 'string' || typeof user?.email !== 'string') {
    throw new Error('Google OAuth returned an invalid user');
  }
  if (!user.email_verified) {
    throw new Error('Google account email is not verified');
  }
  return {
    provider: 'google',
    providerAccountId: user.sub,
    email: user.email.toLowerCase(),
    displayName: (typeof user.name === 'string' && user.name.trim()) || user.email,
  };
}

async function exchangeGitHubCode(config, input) {
  const response = await fetch(GITHUB_ACCESS_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'Anclora-ShiftImport' },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: input.code,
      redirect_uri: config.callbackUrl,
      code_verifier: input.codeVerifier,
    }),
  });
  if (!response.ok) {
    throw new Error('GitHub OAuth token exchange failed');
  }
  const parsed = await response.json();
  if (typeof parsed?.access_token !== 'string' || !parsed.access_token) {
    throw new Error('GitHub OAuth returned an invalid token response');
  }
  return parsed.access_token;
}

function githubApiHeaders(accessToken) {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${accessToken}`,
    'user-agent': 'Anclora-ShiftImport',
    'x-github-api-version': '2022-11-28',
  };
}

async function resolveGitHubIdentity(config, input) {
  const accessToken = await exchangeGitHubCode(config, input);

  const [userResponse, emailsResponse] = await Promise.all([
    fetch(GITHUB_USER_ENDPOINT, { headers: githubApiHeaders(accessToken) }),
    fetch(GITHUB_EMAILS_ENDPOINT, { headers: githubApiHeaders(accessToken) }),
  ]);
  if (!userResponse.ok) {
    throw new Error('GitHub OAuth user lookup failed');
  }
  if (!emailsResponse.ok) {
    throw new Error('GitHub OAuth email lookup failed');
  }

  const user = await userResponse.json();
  const emails = await emailsResponse.json();
  if (typeof user?.id !== 'number' || typeof user?.login !== 'string') {
    throw new Error('GitHub OAuth returned an invalid user');
  }
  if (!Array.isArray(emails)) {
    throw new Error('GitHub OAuth returned an invalid email list');
  }

  const verifiedEmail = emails.find((candidate) => candidate?.primary && candidate?.verified)?.email;
  if (!verifiedEmail) {
    throw new Error('GitHub account has no verified primary email');
  }

  return {
    provider: 'github',
    providerAccountId: String(user.id),
    email: String(verifiedEmail).toLowerCase(),
    displayName: (typeof user.name === 'string' && user.name.trim()) || user.login,
  };
}

/** Exchanges the authorization code for the verified identity. Errors are
 * deliberately generic so internals (tokens, provider payloads) never leak
 * into logs or responses. */
export function resolveProviderOAuthIdentity(provider, config, input) {
  return provider === 'google' ? resolveGoogleIdentity(config, input) : resolveGitHubIdentity(config, input);
}
