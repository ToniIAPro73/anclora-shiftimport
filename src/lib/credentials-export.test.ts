import { describe, expect, it } from 'vitest';
import { buildCredentialsTxt, credentialsFileName, GeneratedCredential } from './credentials-export';

const roleLabel = (role: string) => (role === 'ADMIN' ? 'Admin' : 'Empleado');
const roleLabelEn = (role: string) => (role === 'ADMIN' ? 'Admin' : 'Employee');

const fixedDate = new Date(2026, 8, 4, 9, 5); // 2026-09-04 09:05 local

describe('credentialsFileName', () => {
  it('builds the ES filename with zero-padded date/time', () => {
    expect(credentialsFileName('es', fixedDate)).toBe('shiftimport-credenciales-2026-09-04-0905.txt');
  });

  it('builds the EN filename', () => {
    expect(credentialsFileName('en', fixedDate)).toBe('shiftimport-credentials-2026-09-04-0905.txt');
  });
});

describe('buildCredentialsTxt', () => {
  const credentials: GeneratedCredential[] = [
    { email: 'ana@example.com', displayName: 'Ana Ñoño', role: 'EMPLOYEE', temporaryPassword: 'S3cr3t-fixture-1' },
    { email: 'bruno@example.com', displayName: '', role: 'ADMIN', temporaryPassword: 'S3cr3t-fixture-2' },
  ];

  it('renders the exact ES structure with org name, date, roles and unicode names', () => {
    const text = buildCredentialsTxt('es', 'Café Central', credentials, roleLabel, fixedDate);
    expect(text).toBe([
      'ANCLORA SHIFTIMPORT',
      'Credenciales temporales de acceso',
      '',
      'Generado: 4/9/2026 09:05',
      'Organización: Café Central',
      '',
      'IMPORTANTE',
      'Estas credenciales se muestran una única vez.',
      'Entrégalas a cada usuario mediante un canal seguro.',
      '',
      '----------------------------------------',
      '',
      'Usuario: ana@example.com',
      'Nombre: Ana Ñoño',
      'Rol: Empleado',
      'Contraseña temporal: S3cr3t-fixture-1',
      '',
      '----------------------------------------',
      '',
      'Usuario: bruno@example.com',
      // No displayName supplied -> falls back to the email, never blank.
      'Nombre: bruno@example.com',
      'Rol: Admin',
      'Contraseña temporal: S3cr3t-fixture-2',
      '',
      '----------------------------------------',
      '',
      'Fin del documento.',
    ].join('\n'));
  });

  it('renders the exact EN structure', () => {
    const text = buildCredentialsTxt('en', 'Café Central', credentials, roleLabelEn, fixedDate);
    expect(text).toBe([
      'ANCLORA SHIFTIMPORT',
      'Temporary access credentials',
      '',
      'Generated: 04/09/2026 09:05',
      'Organization: Café Central',
      '',
      'IMPORTANT',
      'These credentials are shown only once.',
      'Share each credential with its user through a secure channel.',
      '',
      '----------------------------------------',
      '',
      'User: ana@example.com',
      'Name: Ana Ñoño',
      'Role: Employee',
      'Temporary password: S3cr3t-fixture-1',
      '',
      '----------------------------------------',
      '',
      'User: bruno@example.com',
      'Name: bruno@example.com',
      'Role: Admin',
      'Temporary password: S3cr3t-fixture-2',
      '',
      '----------------------------------------',
      '',
      'End of document.',
    ].join('\n'));
  });

  it('never includes internal ids, hashes or tokens — only what was explicitly passed in', () => {
    const text = buildCredentialsTxt('es', 'Org', credentials, roleLabel, fixedDate);
    expect(text).not.toMatch(/organization_id|employee_id|userId|passwordHash|scrypt:/i);
  });

  it('produces an empty-credentials document (0 generated) without throwing', () => {
    const text = buildCredentialsTxt('es', 'Org', [], roleLabel, fixedDate);
    expect(text).toContain('Fin del documento.');
    expect(text).not.toContain('Usuario:');
  });
});
