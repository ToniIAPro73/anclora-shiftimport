import { describe, expect, it } from 'vitest';
import { buildInvitationEmail } from './invitations.js';

const base = {
  appUrl: 'https://shiftimport.example.test',
  token: 'clear-token-only-in-memory',
  recipientName: 'Ada Lovelace',
  organizationName: 'Synthetic Org',
  inviterName: 'Owner',
  expiresAt: '2026-09-19T00:00:00.000Z',
};

describe('invitation email rendering', () => {
  it('renders the exact Spanish copy, with only the first name in the greeting', () => {
    const message = buildInvitationEmail({ ...base, locale: 'es' });
    expect(message.subject).toBe('Tienes una invitación para unirte a Synthetic Org');
    expect(message.text).toContain('Hola Ada,');
    expect(message.text).toContain('Owner te ha invitado a unirte a Synthetic Org en Anclora ShiftImport.');
    expect(message.text).toContain('Acepta la invitación para acceder a tus turnos y empezar a utilizar la aplicación.');
    expect(message.text).toContain('Este enlace es personal y estará disponible hasta el');
    expect(message.text).toContain('Si no esperabas este correo, puedes ignorarlo.');
  });

  it('renders a natural English adaptation, not a literal translation', () => {
    const message = buildInvitationEmail({ ...base, locale: 'en' });
    expect(message.subject).toBe('You have an invitation to join Synthetic Org');
    expect(message.text).toContain('Hi Ada,');
    expect(message.text).toContain('Owner has invited you to join Synthetic Org on Anclora ShiftImport.');
    expect(message.text).toContain('Accept the invitation to access your shifts and start using the app.');
    expect(message.text).toContain('This link is personal and will be available until');
  });

  it('never exposes role, employee linkage, invitation status or any account-internal detail', () => {
    const es = buildInvitationEmail({ ...base, locale: 'es' });
    const en = buildInvitationEmail({ ...base, locale: 'en' });
    for (const message of [es, en]) {
      expect(message.text).not.toMatch(/EMPLOYEE|ADMIN|OWNER|PLANNER/);
      expect(message.text.toLowerCase()).not.toContain('tipo de acceso');
      expect(message.text.toLowerCase()).not.toContain('access type');
      expect(message.text.toLowerCase()).not.toContain('perfil');
      expect(message.text.toLowerCase()).not.toContain('profile');
      expect(message.text.toLowerCase()).not.toContain('pending');
      expect(message.text.toLowerCase()).not.toContain('status');
      expect(message.html).not.toMatch(/EMPLOYEE|ADMIN|OWNER|PLANNER/);
    }
  });

  it('falls back to a neutral greeting when no recipient name is available', () => {
    const es = buildInvitationEmail({ ...base, locale: 'es', recipientName: '' });
    expect(es.text.startsWith('Hola,')).toBe(true);
    const en = buildInvitationEmail({ ...base, locale: 'en', recipientName: '' });
    expect(en.text.startsWith('Hi,')).toBe(true);
  });

  it('uses the brand gold CTA button, inline and email-client-safe (solid color, no gradient)', () => {
    const message = buildInvitationEmail({ ...base, locale: 'es' });
    expect(message.html).toContain('background-color:#f0ce62');
    expect(message.html).toContain('color:#1b1f2f');
    expect(message.html).not.toContain('gradient');
    expect(message.html).not.toContain('linear-gradient');
    expect(message.html).toContain('>Aceptar invitación</a>');
  });

  it('never includes a password field, and the clear token appears only in the link', () => {
    const message = buildInvitationEmail({ ...base, locale: 'es' });
    expect(message).not.toHaveProperty('password');
    expect(message.text.toLowerCase()).not.toContain('password');
    expect(message.text.toLowerCase()).not.toContain('contraseña');
    expect(message.text).toContain(base.token);
  });

  it('places the clear token only in the fragment of the generated link', () => {
    const message = buildInvitationEmail({ ...base, locale: 'es' });
    expect(message.text).toContain(`/accept-invitation#token=${base.token}`);
    expect(message.text).not.toContain('/accept-invitation?token=');
    expect(message.html).toContain(`/accept-invitation#token=${base.token}`);
  });
});
