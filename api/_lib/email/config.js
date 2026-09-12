const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export class EmailConfigurationError extends Error {
  constructor(message, code = 'EMAIL_CONFIG_INVALID') {
    super(message);
    this.name = 'EmailConfigurationError';
    this.code = code;
  }
}
function required(environment, key) {
  const value = environment[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new EmailConfigurationError(`Email configuration is missing ${key}`);
  }
  return value.trim();
}

function validateAbsoluteAppUrl(value, environment) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new EmailConfigurationError('AUTH_APP_URL must be an absolute URL');
  }
  const nodeEnv = environment.NODE_ENV || 'development';
  const localDevelopment = nodeEnv === 'development' || nodeEnv === 'test';
  if (parsed.protocol !== 'https:' && !(localDevelopment && parsed.protocol === 'http:')) {
    throw new EmailConfigurationError('AUTH_APP_URL must use HTTPS outside local development and tests');
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new EmailConfigurationError('AUTH_APP_URL must not contain credentials or a fragment');
  }
  return parsed.toString().replace(/\/$/, '');
}

function validateSender(value) {
  if (/[\r\n]/.test(value)) {
    throw new EmailConfigurationError('AUTH_EMAIL_FROM must not contain line breaks');
  }
  const match = value.match(/^(?:.+\s+)?<([^<>]+)>$/);
  const address = (match ? match[1] : value).trim();
  if (!EMAIL_RE.test(address)) {
    throw new EmailConfigurationError('AUTH_EMAIL_FROM must contain a valid sender address');
  }
  return value;
}

/**
 * Reads and validates server-only email configuration. No provider client is
 * created here, so importing this module has no network side effects.
 */
export function readEmailConfig(environment = process.env) {
  return Object.freeze({
    resendApiKey: required(environment, 'RESEND_API_KEY'),
    emailFrom: validateSender(required(environment, 'AUTH_EMAIL_FROM')),
    appUrl: validateAbsoluteAppUrl(required(environment, 'AUTH_APP_URL'), environment),
  });
}
