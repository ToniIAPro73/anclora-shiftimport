import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { mergeShiftTypeOverrides, SHIFT_TYPE_PRESET_EXAMPLE } from '../../lib/shift-types';
import { expandShiftTokens } from './tokens';

setupLocalStorageMock();

// Some documents print a footnote reference inline in the same cell/text
// run as the shift code (e.g. "AJ [2]" pointing at a note explaining the
// day was moved from another date). The footnote is document metadata, not
// part of the code's identity — classification must resolve it exactly like
// the bare code, or an annotated occurrence of an otherwise-known code is
// silently lost (Fase: FTP quincena PDF real-world regression).
describe('expandShiftTokens — footnote-annotated codes', () => {
  it('resolves a bare company off-code once its alias is taught', () => {
    mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
    expect(expandShiftTokens('AJ')).toEqual(['OFF']);
  });

  it('resolves the same code with a trailing footnote reference identically', () => {
    mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
    expect(expandShiftTokens('AJ [2]')).toEqual(['OFF']);
    expect(expandShiftTokens('DL [12]')).toEqual(['OFF']);
  });

  it('does not resolve an unknown code just because it carries a footnote', () => {
    expect(expandShiftTokens('AJ [2]')).toEqual([]);
  });

  it('leaves literal times untouched (no bracket to strip)', () => {
    expect(expandShiftTokens('09:00-17:00')).toEqual(['09:00', '17:00']);
  });
});
