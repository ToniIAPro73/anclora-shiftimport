import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { acceptAccessInvitation, createInvitationToken, invitationPublicState, isValidInvitationToken, normalizeInvitationEmail, requireInvitationLocale, validateAccessInvitation } from './invitations.js';

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

  it('accepts only the issued token shape', () => {
    const { token } = createInvitationToken();
    expect(isValidInvitationToken(token)).toBe(true);
    expect(isValidInvitationToken(`${token}x`)).toBe(false);
    expect(isValidInvitationToken('token-in-a-query-string')).toBe(false);
  });

  it('resolves the safe acceptance mode without exposing account details', async () => {
    const { token } = createInvitationToken();
    const sql = () => Promise.resolve([{
      id: 'invitation-id',
      organization_id: 'organization-id',
      organization_person_id: null,
      email_normalized: 'person@example.test',
      status: 'PENDING',
      created_at: '2026-09-12T00:00:00.000Z',
      expires_at: '2026-09-19T00:00:00.000Z',
      organization_name: 'Synthetic Org',
      employee_name: null,
      role: 'EMPLOYEE',
      account_status: 'ACTIVE',
    }]);
    const result = await validateAccessInvitation(sql, token);
    expect(result.acceptanceMode).toBe('LINK_EXISTING');
    expect(result).not.toHaveProperty('accountStatus');
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('does not allow an existing account to submit a password through acceptance', async () => {
    const { token } = createInvitationToken();
    const sql = () => Promise.resolve([{
      status: 'PENDING',
      expires_at: '2099-09-19T00:00:00.000Z',
      email_normalized: 'person@example.test',
      account_status: 'ACTIVE',
    }]);
    sql.transaction = () => { throw new Error('transaction should not start'); };
    await expect(acceptAccessInvitation(sql, {
      token,
      email: 'person@example.test',
      password: 'not-used-here',
      passwordConfirmation: 'not-used-here',
    })).rejects.toMatchObject({ code: 'PASSWORD_NOT_ALLOWED', status: 400 });
  });

  it('requires both a display name and password for a new account', async () => {
    const { token } = createInvitationToken();
    const sql = () => Promise.resolve([{
      status: 'PENDING',
      expires_at: '2099-09-19T00:00:00.000Z',
      email_normalized: 'person@example.test',
      account_status: null,
    }]);
    sql.transaction = () => { throw new Error('transaction should not start'); };
    await expect(acceptAccessInvitation(sql, {
      token,
      email: 'person@example.test',
    })).rejects.toMatchObject({ code: 'DISPLAY_NAME_REQUIRED', status: 400 });
    await expect(acceptAccessInvitation(sql, {
      token,
      email: 'person@example.test',
      displayName: 'Synthetic Person',
    })).rejects.toMatchObject({ code: 'PASSWORD_REQUIRED', status: 400 });
  });

  it('keeps a globally suspended account unavailable without exposing its state', async () => {
    const { token } = createInvitationToken();
    const sql = () => Promise.resolve([{
      status: 'PENDING',
      expires_at: '2099-09-19T00:00:00.000Z',
      email_normalized: 'person@example.test',
      account_status: 'SUSPENDED',
    }]);
    await expect(validateAccessInvitation(sql, token)).rejects.toMatchObject({
      code: 'INVITATION_INVALID',
      status: 404,
    });
  });
});
