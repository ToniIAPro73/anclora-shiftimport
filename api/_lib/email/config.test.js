import { describe, expect, it } from 'vitest';
import { EmailConfigurationError, readEmailConfig } from './config.js';
import { createEmailTransport } from './transport.js';

const complete = {
  RESEND_API_KEY: 'test-key',
  AUTH_EMAIL_FROM: 'ShiftImport <no-reply@example.com>',
  AUTH_APP_URL: 'http://localhost:5173',
  NODE_ENV: 'test',
};

describe('server-side email configuration', () => {
  it('accepts complete local/test configuration without exposing values', () => {
    const config = readEmailConfig(complete);
    expect(config).toMatchObject({ emailFrom: complete.AUTH_EMAIL_FROM, appUrl: complete.AUTH_APP_URL });
    expect(config.resendApiKey).toBe(complete.RESEND_API_KEY);
  });

  it.each(['RESEND_API_KEY', 'AUTH_EMAIL_FROM', 'AUTH_APP_URL'])('rejects missing %s', (key) => {
    const env = { ...complete };
    delete env[key];
    expect(() => readEmailConfig(env)).toThrow(EmailConfigurationError);
  });

  it('rejects empty variables and invalid app URLs', () => {
    expect(() => readEmailConfig({ ...complete, RESEND_API_KEY: '  ' })).toThrow(/missing RESEND_API_KEY/);
    expect(() => readEmailConfig({ ...complete, AUTH_APP_URL: 'not-a-url' })).toThrow(/absolute URL/);
    expect(() => readEmailConfig({ ...complete, AUTH_APP_URL: 'http://localhost:5173', NODE_ENV: 'production' }))
      .toThrow(/HTTPS/);
    expect(() => readEmailConfig({ ...complete, AUTH_EMAIL_FROM: 'not-an-email' })).toThrow(/valid sender/);
  });

  it('uses an injected transport and never requires a provider client', async () => {
    const calls = [];
    const transport = createEmailTransport({
      environment: complete,
      send: async (input) => { calls.push(input.message); return { id: 'test-delivery' }; },
    });
    await expect(transport.send({ to: 'recipient@example.com' })).resolves.toEqual({ id: 'test-delivery' });
    expect(calls).toEqual([{ to: 'recipient@example.com' }]);
  });

  it('does not import server email configuration from the client source tree', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(new URL('../../../src/main.tsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/RESEND_API_KEY|api\/_lib\/email/);
  });
});
