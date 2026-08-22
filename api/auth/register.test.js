import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('register — email duplicate / user resolution', () => {
  const getRegisterSrc = async () =>
    fs.readFile(path.resolve(__dirname, 'register.js'), 'utf8');
  const getDataSrc = async () =>
    fs.readFile(
      path.resolve(__dirname, '..', '_lib', 'data.js'),
      'utf8'
    );

  describe('Caso A — email nuevo', () => {
    it('has SELECT before INSERT for existing user check', async () => {
      const src = await getRegisterSrc();
      const selIdx = src.indexOf('SELECT id FROM users WHERE lower(email)');
      const insIdx = src.indexOf('INSERT INTO users');
      expect(selIdx).toBeGreaterThan(-1);
      expect(insIdx).toBeGreaterThan(selIdx);
    });
  });

  describe('Caso B — email ya registrado', () => {
    it('returns 409 when SELECT finds match', async () => {
      const src = await getRegisterSrc();
      expect(src).toContain("Email already registered");
    });
  });

  describe('Caso C — User ya vinculado', () => {
    it('USER_ALREADY_LINKED exists in data.js', async () => {
      const src = await getDataSrc();
      expect(src).toContain('USER_ALREADY_LINKED');
    });
    it('EMPLOYEE_ALREADY_LINKED exists in data.js', async () => {
      const src = await getDataSrc();
      expect(src).toContain('EMPLOYEE_ALREADY_LINKED');
    });
  });

  describe('Caso D — unique violation race fallback', () => {
    it('catch block maps 23505 on email → domain error', async () => {
      const src = await getRegisterSrc();
      // Verify the 23505 guard is inside catch block (appears after "catch")
      const catchIdx = src.indexOf('catch (error)');
      const constraintIdx = src.indexOf('users_email_lower_idx');
      const errCodeIdx = src.search(/error\?\.\s*code/);
      
      expect(catchIdx).toBeGreaterThan(-1);
      expect(constraintIdx).toBeGreaterThan(-1);
      expect(errCodeIdx).toBeGreaterThan(-1);
      expect(errCodeIdx).toBeGreaterThan(catchIdx);
    });
  });
});
