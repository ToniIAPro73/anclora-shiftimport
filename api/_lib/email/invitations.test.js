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
  it('renders warm, human Spanish copy — never the raw role enum', () => {
    const message = buildInvitationEmail({ ...base, locale: 'es' });
    expect(message.subject).toBe('Te han invitado a unirte a Synthetic Org en Anclora ShiftImport');
    expect(message.text).toContain('Hola Ada &lt;QA&gt;,');
    expect(message.text).toContain('Owner te ha invitado a formar parte de Synthetic Org en Anclora ShiftImport.');
    expect(message.text).toContain('Al aceptar la invitación podrás acceder a tus turnos y a las funciones asignadas a tu perfil.');
    expect(message.text).toContain('Tipo de acceso: Empleado');
    expect(message.text).toContain('Esta invitación estará disponible hasta el');
    expect(message.text).toContain('Si no esperabas esta invitación, puedes ignorar este mensaje. Tu cuenta no sufrirá ningún cambio.');
    expect(message.text).not.toContain('EMPLOYEE');
    expect(message.html).toContain('Ada &lt;QA&gt;');
    expect(message.html).not.toContain('EMPLOYEE');
  });

  it('renders warm, human English copy — never the raw role enum', () => {
    const message = buildInvitationEmail({ ...base, locale: 'en' });
    expect(message.subject).toBe("You've been invited to join Synthetic Org on Anclora ShiftImport");
    expect(message.text).toContain('Hi Ada &lt;QA&gt;,');
    expect(message.text).toContain('Owner has invited you to be part of Synthetic Org on Anclora ShiftImport.');
    expect(message.text).toContain('Access type: Employee');
    expect(message.text).toContain('This invitation will be available until');
    expect(message.text).not.toContain('EMPLOYEE');
  });

  it('localizes every supported role, in both languages', () => {
    const roles = [
      ['OWNER', 'Propietario', 'Owner'],
      ['ADMIN', 'Administrador', 'Admin'],
      ['PLANNER', 'Planificador', 'Planner'],
      ['EMPLOYEE', 'Empleado', 'Employee'],
    ];
    for (const [role, es, en] of roles) {
      expect(buildInvitationEmail({ ...base, role, locale: 'es' }).text).toContain(`Tipo de acceso: ${es}`);
      expect(buildInvitationEmail({ ...base, role, locale: 'en' }).text).toContain(`Access type: ${en}`);
    }
  });

  it('mentions the associated employee profile only when one exists', () => {
    const withProfile = buildInvitationEmail({ ...base, locale: 'es', employeeName: 'Marta Ruiz' });
    expect(withProfile.text).toContain('Tu acceso quedará vinculado al perfil de Marta Ruiz.');
    expect(withProfile.html).toContain('Tu acceso quedará vinculado al perfil de Marta Ruiz.');

    const withoutProfile = buildInvitationEmail({ ...base, locale: 'es', employeeName: null });
    expect(withoutProfile.text).not.toContain('vinculado al perfil');
    expect(withoutProfile.html).not.toContain('vinculado al perfil');
  });

  it('falls back to a neutral greeting when no recipient name is available', () => {
    const es = buildInvitationEmail({ ...base, locale: 'es', recipientName: '' });
    expect(es.text.startsWith('Hola,')).toBe(true);
    const en = buildInvitationEmail({ ...base, locale: 'en', recipientName: '' });
    expect(en.text.startsWith('Hi,')).toBe(true);
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
