import { describe, expect, it } from 'vitest';
import { isImportAutoPublishEnabled } from './import-flags.js';

describe('IMPORT_AUTO_PUBLISH_ENABLED (deployment switch)', () => {
  it('is OFF by default and for anything that is not the explicit word true', () => {
    for (const value of [undefined, '', 'false', '0', '1', 'yes', 'on', 'enabled']) {
      expect(isImportAutoPublishEnabled({ IMPORT_AUTO_PUBLISH_ENABLED: value })).toBe(false);
    }
    expect(isImportAutoPublishEnabled({})).toBe(false);
  });

  it('is ON only for `true` (case and surrounding spaces ignored)', () => {
    for (const value of ['true', 'TRUE', ' True ']) expect(isImportAutoPublishEnabled({ IMPORT_AUTO_PUBLISH_ENABLED: value })).toBe(true);
  });
});
