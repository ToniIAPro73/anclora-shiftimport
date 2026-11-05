import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { translate } from '../../lib/i18n';

// Every `teamWorkspace.*` key the Equipo workspace uses must exist in BOTH languages (no raw key echoed on screen) and be translated
// (not the Spanish text repeated in English), except for the few product terms that are legitimately identical.
const SAME_IN_BOTH = new Set(['bulkEmployeeId', 'no', 'noSummary']);
const source = readFileSync(join(__dirname, 'EquipoModal.tsx'), 'utf8');
const keys = [...new Set([...source.matchAll(/'teamWorkspace\.([A-Za-z0-9_]+)'/g)].map((m) => m[1]))].sort();

describe('Equipo workspace i18n', () => {
  it('finds the keys used by the component', () => {
    expect(keys.length).toBeGreaterThan(60);
  });
  it.each(keys)('teamWorkspace.%s resolves in ES and EN', (key) => {
    const full = `teamWorkspace.${key}`;
    const es = translate('es', full, { count: 2, selected: 1, total: 3, area: 'A', date: '2026-01-01', current: 1, name: 'N', names: 'A, B' });
    const en = translate('en', full, { count: 2, selected: 1, total: 3, area: 'A', date: '2026-01-01', current: 1, name: 'N', names: 'A, B' });
    expect(es, `${full} (es) must not echo the key`).not.toBe(full);
    expect(en, `${full} (en) must not echo the key`).not.toBe(full);
    if (!SAME_IN_BOTH.has(key)) expect(en, `${full} must be translated`).not.toBe(es);
  });
});
