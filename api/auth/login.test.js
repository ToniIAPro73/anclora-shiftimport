import { describe, expect, it } from 'vitest';
import { hashPassword } from '../_lib/passwords.js';
import { isPasswordLoginAllowed } from './login.js';

describe('account lifecycle login gate', () => {
  it('rejects a pending invitation account before authentication', () => {
    expect(isPasswordLoginAllowed({ account_status: 'PENDING_INVITATION', password_hash: hashPassword('correct-pass') }, 'correct-pass'))
      .toBe(false);
  });

  it('rejects suspended accounts', () => {
    expect(isPasswordLoginAllowed({ account_status: 'SUSPENDED', password_hash: hashPassword('correct-pass') }, 'correct-pass'))
      .toBe(false);
  });

  it('keeps active OAuth-only accounts eligible for the OAuth flow but not password login', () => {
    expect(isPasswordLoginAllowed({ account_status: 'ACTIVE', password_hash: null }, 'anything')).toBe(false);
  });

  it('accepts an active local account with its existing scrypt hash', () => {
    const hash = hashPassword('correct-pass');
    expect(isPasswordLoginAllowed({ account_status: 'ACTIVE', password_hash: hash }, 'correct-pass')).toBe(true);
    expect(isPasswordLoginAllowed({ account_status: 'ACTIVE', password_hash: hash }, 'wrong-pass')).toBe(false);
  });
});
