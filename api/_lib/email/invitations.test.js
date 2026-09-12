import { describe, expect, it } from 'vitest';
import { buildInvitationEmail } from './invitations.js';

const base = {
  appUrl: 'https://shiftimport.example.test',
  token: 'clear-token-only-in-memory',
  recipientName: 'Ada <QA>',
  organizationName: 'Synthetic Org',
  inviterName: 'Owner',
  role: 'EMPLOYEE',
  expiresAt: '2026-09-19T00:00:00.000Z',
};

describe('invitation email rendering', () => {
  it('renders Spanish content when the application locale is Spanish', () => {
    const message = buildInvitationEmail({ ...base, locale: 'es' });
    expect(message.subject).toMatch(/^Invitación/);
    expect(message.text).toContain('Aceptar la invitación');
    expect(message.html).toContain('Ada &lt;QA&gt;');
  });

  it('renders English content when the application locale is English', () => {
    const message = buildInvitationEmail({ ...base, locale: 'en' });
    expect(message.subject).toMatch(/^Invitation/);
    expect(message.text).toContain('Accept the invitation');
  });

  it('never includes a token hash or password field', () => {
    const message = buildInvitationEmail({ ...base, locale: 'es' });
    expect(message).not.toHaveProperty('password');
    expect(message.text).toContain(base.token);
  });
});
