/**
 * Reads one provider's OAuth configuration from the environment. Returns
 * `null` when none of its variables is set (provider disabled). Throws when
 * partially set — a half-configured provider is a deployment bug and must
 * fail fast instead of degrading silently.
 */
function readConfig(prefix, environment) {
  const raw = {
    clientId: environment[`${prefix}_OAUTH_CLIENT_ID`],
    clientSecret: environment[`${prefix}_OAUTH_CLIENT_SECRET`],
    callbackUrl: environment[`${prefix}_OAUTH_CALLBACK_URL`],
  };
  const isConfigured = Object.values(raw).some((v) => typeof v === 'string' && v.trim().length > 0);
  if (!isConfigured) {
    return null;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`${prefix} OAuth configuration is incomplete (missing ${key})`);
    }
  }
  return { clientId: raw.clientId.trim(), clientSecret: raw.clientSecret.trim(), callbackUrl: raw.callbackUrl.trim() };
}

export function readGoogleOAuthConfig(environment = process.env) {
  return readConfig('GOOGLE', environment);
}

export function readGitHubOAuthConfig(environment = process.env) {
  return readConfig('GITHUB', environment);
}

export function readProviderOAuthConfig(provider, environment = process.env) {
  return provider === 'google' ? readGoogleOAuthConfig(environment) : readGitHubOAuthConfig(environment);
}
