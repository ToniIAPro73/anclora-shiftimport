import { describe, expect, it } from 'vitest';
import { detectImportFlow } from './import-dispatcher';

describe('detectImportFlow', () => {
  it.each([
    [0, 'blocked'],
    [1, 'individual'],
    [2, 'team'],
    [20, 'team'],
  ] as const)('routes %s detected employees to %s', (count, expected) => {
    expect(detectImportFlow(Array.from({ length: count }, (_, index) => ({ name: `Employee ${index}` })))).toBe(expected);
  });
});
