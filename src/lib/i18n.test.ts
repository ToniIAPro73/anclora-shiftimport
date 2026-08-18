import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import { DEFAULT_LOCALE, loadLocale, saveLocale, translate, translateList, translateShiftTypeLabel } from './i18n';

setupLocalStorageMock();

describe('i18n', () => {
  it('defaults to Spanish when nothing is persisted', () => {
    expect(DEFAULT_LOCALE).toBe('es');
    expect(loadLocale()).toBe('es');
  });

  it('persists and restores the chosen locale', () => {
    saveLocale('en');
    expect(loadLocale()).toBe('en');
    saveLocale('es');
    expect(loadLocale()).toBe('es');
  });

  it('ignores an invalid persisted value and falls back to the default', () => {
    localStorage.setItem('anclora_shiftimport_locale_v1', 'fr');
    expect(loadLocale()).toBe('es');
  });

  it('translates a known key differently per locale', () => {
    const es = translate('es', 'importModal.process');
    const en = translate('en', 'importModal.process');
    expect(es).toBe('Procesar archivo');
    expect(en).toBe('Process file');
    expect(es).not.toBe(en);
  });

  it('interpolates variables into the translated string', () => {
    expect(translate('es', 'importModal.confirmImport', { ready: 2, total: 3 })).toContain('2/3');
    expect(translate('en', 'importModal.confirmImport', { ready: 2, total: 3 })).toContain('2/3');
  });

  it('falls back to Spanish when a key is missing in the requested locale (unknown key returns the key itself)', () => {
    expect(translate('en', 'not.a.real.key')).toBe('not.a.real.key');
  });

  it('translates month names as an ordered list per locale', () => {
    const es = translateList('es', 'calendar.months');
    const en = translateList('en', 'calendar.months');
    expect(es[0]).toBe('Enero');
    expect(en[0]).toBe('January');
    expect(es).toHaveLength(12);
    expect(en).toHaveLength(12);
  });

  it('translates the default shift type labels only (custom labels pass through unchanged)', () => {
    expect(translateShiftTypeLabel('Libre', 'es', 'Libre')).toBe('Libre');
    expect(translateShiftTypeLabel('Libre', 'en', 'Libre')).toBe('Free');
    expect(translateShiftTypeLabel('Vacaciones', 'en', 'Vacaciones')).toBe('Vacation');
    expect(translateShiftTypeLabel('Regular', 'en', 'Regular')).toBe('Regular');
    expect(translateShiftTypeLabel('Turno Personalizado', 'en', 'Turno Personalizado')).toBe('Turno Personalizado');
  });
});
