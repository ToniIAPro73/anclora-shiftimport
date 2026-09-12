import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createInvitationToken, invitationPublicState, normalizeInvitationEmail, requireInvitationLocale } from './invitations.js';

describe('access invitation primitives', () => {
  it('normalizes valid email addresses and rejects malformed input', () => {
    expect(normalizeInvitationEmail('  Person@Example.com ')).toBe('person@example.com');
    expect(() => normalizeInvitationEmail('invalid')).toThrow();
  });

  it('creates a cryptographic token whose persisted representation is only SHA-256', () => {
    const { token, tokenHash } = createInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('recognizes valid, expired and terminal invitation states', () => {
    const now = new Date('2026-09-12T00:00:00.000Z');
    expect(invitationPublicState({ status: 'PENDING', expires_at: '2026-09-13T00:00:00.000Z' }, now)).toBe('VALID');
    expect(invitationPublicState({ status: 'PENDING', expires_at: '2026-09-11T00:00:00.000Z' }, now)).toBe('EXPIRED');
    expect(invitationPublicState({ status: 'ACCEPTED', expires_at: '2026-09-13T00:00:00.000Z' }, now)).toBe('INVALID');
  });

  it('requires the current application locale for invitation generation', () => {
    expect(requireInvitationLocale('es')).toBe('es');
    expect(requireInvitationLocale('en')).toBe('en');
    expect(() => requireInvitationLocale(undefined)).toThrowError(/locale is required/i);
  });
});
