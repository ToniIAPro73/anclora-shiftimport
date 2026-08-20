import { describe, expect, it } from 'vitest';
import { resolveRoute } from './route';

describe('resolveRoute', () => {
  it('resolves known public and app paths as-is', () => {
    expect(resolveRoute('/')).toBe('/');
    expect(resolveRoute('/pricing')).toBe('/pricing');
    expect(resolveRoute('/login')).toBe('/login');
    expect(resolveRoute('/signup')).toBe('/signup');
    expect(resolveRoute('/app')).toBe('/app');
  });

  it('strips a trailing slash before matching', () => {
    expect(resolveRoute('/pricing/')).toBe('/pricing');
  });

  it('falls back unknown paths to /app (legacy deep links, e.g. /privacy handled earlier by App)', () => {
    expect(resolveRoute('/whatever')).toBe('/app');
    expect(resolveRoute('/privacy')).toBe('/app');
  });
});
