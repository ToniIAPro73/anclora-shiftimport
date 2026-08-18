import { describe, expect, it } from 'vitest';
import {
  SUPPORTED_IMPORT_FORMATS,
  getImportFormatLabel,
  importAcceptAttribute,
  importFormatsDisplayLine,
} from './formats';

describe('import format capability registry', () => {
  it('declares capabilities for pdf, image, csv and xlsx', () => {
    expect(SUPPORTED_IMPORT_FORMATS.map((format) => format.id)).toEqual(['pdf', 'image', 'csv', 'xlsx']);
  });

  it('every registered format has a parser path', () => {
    for (const format of SUPPORTED_IMPORT_FORMATS) {
      expect(format.parser.length).toBeGreaterThan(0);
      expect(format.capability).not.toBe('NOT_SUPPORTED');
      expect(format.extensions.length).toBeGreaterThan(0);
    }
  });

  it('accept attribute reflects the registry', () => {
    const accept = importAcceptAttribute();
    expect(accept).toContain('.pdf');
    expect(accept).toContain('.csv');
    expect(accept).toContain('.png');
    expect(accept).toContain('image/png');
    expect(accept).toContain('.xlsx');
  });

  it('display line lists only registered formats', () => {
    const line = importFormatsDisplayLine();
    expect(line).toContain('PDF');
    expect(line).toContain('CSV');
    expect(line).toContain('XLSX');
    expect(line).toContain('PNG');
  });

  it('labels known ids and falls back faithfully for unknown ones', () => {
    expect(getImportFormatLabel('csv')).toBe('CSV');
    expect(getImportFormatLabel('odt')).toBe('ODT');
  });
});