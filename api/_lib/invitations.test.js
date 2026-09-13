import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { acceptAccessInvitation, createInvitationToken, invitationCausesSessionConflict, invitationPublicState, isValidInvitationToken, normalizeInvitationEmail, requireInvitationLocale, resolveAcceptLanguageLocale, resolveInvitationDisplayName, validateAccessInvitation } from './invitations.js';

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
      organization_name: 'Estudio Horizonte',
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
      password: 'not-used-here',
    })).rejects.toMatchObject({ code: 'PASSWORD_NOT_ALLOWED', status: 400 });
  });

  it('ignores any email sent by the client — the invitation row is the only source', async () => {
    const { token } = createInvitationToken();
    const sql = () => Promise.resolve([{
      status: 'PENDING',
      expires_at: '2099-09-19T00:00:00.000Z',
      email_normalized: 'real@example.test',
      account_status: 'ACTIVE',
    }]);
    sql.transaction = () => { throw new Error('transaction should not start'); };
    // A mismatched client-sent email changes nothing: the LINK_EXISTING +
    // password guard still fires, proving email was never read from input.
    await expect(acceptAccessInvitation(sql, {
      token,
      email: 'attacker@example.test',
      password: 'irrelevant',
    })).rejects.toMatchObject({ code: 'PASSWORD_NOT_ALLOWED', status: 400 });
  });

  it('requires a password for a new account and never requires a display name from the client', async () => {
    const { token } = createInvitationToken();
    const sql = () => Promise.resolve([{
      status: 'PENDING',
      expires_at: '2099-09-19T00:00:00.000Z',
      email_normalized: 'person@example.test',
      account_status: null,
      employee_name: null,
    }]);
    sql.transaction = () => { throw new Error('transaction should not start'); };
    await expect(acceptAccessInvitation(sql, { token }))
      .rejects.toMatchObject({ code: 'PASSWORD_REQUIRED', status: 400 });
  });

  it('resolves the display name automatically: employee profile name, else the email local part — never asks the client', () => {
    expect(resolveInvitationDisplayName({ employeeName: 'Ada Lovelace', email: 'person@example.test' })).toBe('Ada Lovelace');
    expect(resolveInvitationDisplayName({ employeeName: null, email: 'person@example.test' })).toBe('person');
    expect(resolveInvitationDisplayName({ employeeName: '  ', email: 'jane.doe@example.test' })).toBe('jane.doe');
  });

  it('resolves the initial locale from Accept-Language, defaulting to Spanish — never from a client payload field', () => {
    expect(resolveAcceptLanguageLocale('en-US,en;q=0.9,es;q=0.8')).toBe('en');
    expect(resolveAcceptLanguageLocale('es-ES,es;q=0.9')).toBe('es');
    expect(resolveAcceptLanguageLocale(undefined)).toBe('es');
    expect(resolveAcceptLanguageLocale('')).toBe('es');
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

describe('invitation acceptance never silently replaces another identity\'s session', () => {
  it('flags a conflict only when the authenticated caller differs from the invitation email', () => {
    expect(invitationCausesSessionConflict('owner@example.test', 'employee@example.test')).toBe(true);
    expect(invitationCausesSessionConflict('Owner@Example.test', 'owner@example.test')).toBe(false);
    expect(invitationCausesSessionConflict(null, 'employee@example.test')).toBe(false);
    expect(invitationCausesSessionConflict(undefined, 'employee@example.test')).toBe(false);
  });

  function fakeAcceptSql({ email, accountStatus = 'ACTIVE', userId = 'user-1', organizationId = 'org-1' }) {
    const sql = () => Promise.resolve([{
      status: 'PENDING',
      expires_at: '2099-09-19T00:00:00.000Z',
      email_normalized: email,
      account_status: accountStatus,
      employee_name: null,
    }]);
    sql.transaction = () => Promise.resolve([[{ id: 'invitation-1', organization_id: organizationId, user_id: userId }]]);
    return sql;
  }

  it('does not create a session when the caller is authenticated as a different identity', async () => {
    const { token } = createInvitationToken();
    const sql = fakeAcceptSql({ email: 'employee@example.test' });
    const createSessionFn = () => Promise.reject(new Error('a session must not be created on conflict'));
    const result = await acceptAccessInvitation(sql, { token }, {
      createSessionFn,
      currentUserEmail: 'owner@example.test',
    });
    expect(result.requiresAccountSwitch).toBe(true);
    expect(result.session).toBeUndefined();
    expect(result.user_id).toBe('user-1');
  });

  it('still creates a session when the caller is already authenticated as the same identity', async () => {
    const { token } = createInvitationToken();
    const sql = fakeAcceptSql({ email: 'owner@example.test' });
    const result = await acceptAccessInvitation(sql, { token }, {
      createSessionFn: () => Promise.resolve({ token: 'new-session-token', expiresAt: new Date('2099-01-01') }),
      currentUserEmail: 'Owner@Example.test',
    });
    expect(result.requiresAccountSwitch).toBe(false);
    expect(result.session).toEqual({ token: 'new-session-token', expiresAt: new Date('2099-01-01') });
  });

  it('creates a session as before when there is no active caller session at all', async () => {
    const { token } = createInvitationToken();
    const sql = fakeAcceptSql({ email: 'new-recipient@example.test', accountStatus: null });
    const result = await acceptAccessInvitation(sql, { token, password: 'a-strong-password' }, {
      createSessionFn: () => Promise.resolve({ token: 'brand-new-session', expiresAt: new Date('2099-01-01') }),
      currentUserEmail: null,
    });
    expect(result.requiresAccountSwitch).toBe(false);
    expect(result.session).toEqual({ token: 'brand-new-session', expiresAt: new Date('2099-01-01') });
  });
});
