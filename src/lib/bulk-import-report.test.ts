import { describe, expect, it } from 'vitest';
import { buildCsv } from './bulk-import-report';

describe('bulk import reports', () => {
  it('neutralizes spreadsheet formula prefixes and quotes cells', () => {
    const csv = buildCsv(['email', 'message'], [{ email: '=HYPERLINK("x")', message: 'line\nwith,commas' }]);
    expect(csv).toContain("'=HYPERLINK(\"\"x\"\")");
    expect(csv).toContain('"line\nwith,commas"');
  });
});
