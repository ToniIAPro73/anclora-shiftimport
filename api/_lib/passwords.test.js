import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './passwords.js';

describe('password hashing', () => {
  it('roundtrip verifies the original password', () => {
    const stored = hashPassword('sup3r-secret!');
    expect(stored.startsWith('scrypt:')).toBe(true);
    expect(verifyPassword('sup3r-secret!', stored)).toBe(true);
  });

  it('rejects wrong passwords and malformed hashes', () => {
    const stored = hashPassword('sup3r-secret!');
    expect(verifyPassword('wrong-password', stored)).toBe(false);
    expect(verifyPassword('sup3r-secret!', 'not-a-hash')).toBe(false);
    expect(verifyPassword('sup3r-secret!', '')).toBe(false);
  });

  it('never stores the plaintext password', () => {
    expect(hashPassword('sup3r-secret!')).not.toContain('sup3r-secret!');
  });
});
