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
      async send(message) {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: config.emailFrom,
            to: message.to,
            subject: message.subject,
            html: message.html,
            text: message.text,
          }),
        });
        if (!response.ok) {
          const error = new Error('Email provider rejected the message');
          error.code = 'EMAIL_PROVIDER_REJECTED';
          throw error;
        }
        const body = await response.json().catch(() => ({}));
        return { id: typeof body?.id === 'string' ? body.id : null };
      },
    });
  }
  return Object.freeze({
    config,
    send: (message) => send({ config, message }),
  });
}
