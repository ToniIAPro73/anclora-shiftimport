/**
 * Client-side-only generator for the one-time "temporary credentials" TXT
 * file handed out after a Users CSV import (MembersModal). Pure functions,
 * no network/storage access — the caller is responsible for triggering the
 * browser download and for dropping the in-memory result once the modal is
 * closed or a new import starts (no server-side credential storage or
 * retrieval endpoint exists, and none should be built to support this).
 *
 * Security invariants this module must uphold:
 * - Never includes internal ids (userId/employeeId/organizationId), password
 *   hashes, or tokens — only what a human handing over an account needs.
 * - Every field is written as inert plain text (no formula/markup
 *   interpretation anywhere downstream — this is a .txt file, not CSV).
 */
import type { Locale } from './i18n';

export interface GeneratedCredential {
  email: string;
  /** Display name if known; falls back to the email in the rendered block. */
  displayName?: string;
  role: string;
  temporaryPassword: string;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** `shiftimport-credenciales-YYYY-MM-DD-HHmm.txt` (es) /
 * `shiftimport-credentials-YYYY-MM-DD-HHmm.txt` (en). Uses local time —
 * matches what the ADMIN sees on screen, not UTC. */
export function credentialsFileName(locale: Locale, date: Date = new Date()): string {
  const stamp = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}`;
  const word = locale === 'es' ? 'credenciales' : 'credentials';
  return `shiftimport-${word}-${stamp}.txt`;
}

function formatGeneratedAt(locale: Locale, date: Date): string {
  const dateLocale = locale === 'es' ? 'es-ES' : 'en-GB';
  return `${date.toLocaleDateString(dateLocale)} ${date.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}`;
}

const COPY = {
  es: {
    title: 'ANCLORA SHIFTIMPORT',
    subtitle: 'Credenciales temporales de acceso',
    generated: 'Generado',
    organization: 'Organización',
    important: 'IMPORTANTE',
    warning1: 'Estas credenciales se muestran una única vez.',
    warning2: 'Entrégalas a cada usuario mediante un canal seguro.',
    user: 'Usuario',
    name: 'Nombre',
    role: 'Rol',
    password: 'Contraseña temporal',
    end: 'Fin del documento.',
  },
  en: {
    title: 'ANCLORA SHIFTIMPORT',
    subtitle: 'Temporary access credentials',
    generated: 'Generated',
    organization: 'Organization',
    important: 'IMPORTANT',
    warning1: 'These credentials are shown only once.',
    warning2: 'Share each credential with its user through a secure channel.',
    user: 'User',
    name: 'Name',
    role: 'Role',
    password: 'Temporary password',
    end: 'End of document.',
  },
} as const;

const SEPARATOR = '----------------------------------------';

/**
 * Renders the one-time credentials TXT. `credentials` must already be
 * filtered to users ACTUALLY created in this import — this function does
 * not filter or validate, it only formats what it's given.
 */
export function buildCredentialsTxt(
  locale: Locale,
  organizationName: string,
  credentials: GeneratedCredential[],
  roleLabel: (role: string) => string,
  date: Date = new Date(),
): string {
  const copy = COPY[locale] ?? COPY.es;
  const lines: string[] = [
    copy.title,
    copy.subtitle,
    '',
    `${copy.generated}: ${formatGeneratedAt(locale, date)}`,
    `${copy.organization}: ${organizationName}`,
    '',
    copy.important,
    copy.warning1,
    copy.warning2,
    '',
    SEPARATOR,
    '',
  ];

  for (const credential of credentials) {
    lines.push(`${copy.user}: ${credential.email}`);
    lines.push(`${copy.name}: ${credential.displayName?.trim() || credential.email}`);
    lines.push(`${copy.role}: ${roleLabel(credential.role)}`);
    lines.push(`${copy.password}: ${credential.temporaryPassword}`);
    lines.push('');
    lines.push(SEPARATOR);
    lines.push('');
  }

  lines.push(copy.end);
  return lines.join('\n');
}

/** Triggers a browser download of the given text as a UTF-8 .txt file.
 * Client-side only — no server endpoint involved, nothing uploaded. */
export function downloadTextFile(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(url);
  }
}
