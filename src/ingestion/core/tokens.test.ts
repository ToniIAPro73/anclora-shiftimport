import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { mergeShiftTypeOverrides, SHIFT_TYPE_PRESET_EXAMPLE } from '../../lib/shift-types';
import { expandShiftTokens } from './tokens';

setupLocalStorageMock();

// Some documents print a footnote reference inline in the same cell/text
// run as a shift code. AJ is intentionally ignored, including annotations;
// DL remains separately supported when explicitly taught.
describe('expandShiftTokens — footnote-annotated codes', () => {
  it('ignores AJ even when a legacy alias is taught', () => {
    mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
    expect(expandShiftTokens('AJ')).toEqual([]);
  });

  it('resolves the same code with a trailing footnote reference identically', () => {
    mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
    expect(expandShiftTokens('AJ [2]')).toEqual([]);
    expect(expandShiftTokens('DL [12]')).toEqual(['OFF']);
  });

  it('does not resolve an unknown code just because it carries a footnote', () => {
    expect(expandShiftTokens('AJ [2]')).toEqual([]);
  });

  it('leaves literal times untouched (no bracket to strip)', () => {
    expect(expandShiftTokens('09:00-17:00')).toEqual(['09:00', '17:00']);
  });
});
