import { readEmailConfig } from './config.js';

/**
 * Server-side transport seam. The next phase can inject the Resend adapter;
 * tests inject a deterministic adapter and never make a real network call.
 */
export function createEmailTransport({ environment = process.env, send } = {}) {
  const config = readEmailConfig(environment);
  if (typeof send !== 'function') {
    return Object.freeze({
      config,
      async send() {
        const error = new Error('Email transport adapter is not configured');
        error.code = 'EMAIL_TRANSPORT_UNAVAILABLE';
        throw error;
      },
    });
  }
  return Object.freeze({
    config,
    send: (message) => send({ config, message }),
  });
}
