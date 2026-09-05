import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { translate, translateList } from './i18n';

// Flat key inventory pulled straight from the components: every key actually
// used via t()/tl() must resolve to a *different* string in es vs en (no
// silent fallback to the Spanish default, no untranslated key echoed back).
// header.subtitle ("by Anclora Group") is intentionally identical in both
// locales — it's the product's brand line, not a translatable sentence.
const T_KEYS = [
  'header.themeDark', 'header.themeLight', 'header.themeSystem',
  'header.settingsAria', 'header.import', 'header.add',
  'employeePortal.eyebrow', 'employeePortal.emptyLabel', 'employeePortal.emptyTitle',
  'employeePortal.emptyDescription', 'employeePortal.navigationLabel', 'employeePortal.today',
  'employeePortal.week', 'employeePortal.logout',
  'employeeToday.eyebrow', 'employeeToday.title', 'employeeToday.description',
  'employeeToday.published', 'employeeToday.emptyTitle', 'employeeToday.emptyDescription',
  'employeeToday.loading', 'employeeToday.errorTitle', 'employeeToday.errorDescription',
  'employeeToday.retry', 'employeeToday.shiftLabel', 'employeeToday.noLocation',
  'employeeWeek.eyebrow', 'employeeWeek.title', 'employeeWeek.weekNavigation',
  'employeeWeek.previousWeek', 'employeeWeek.nextWeek', 'employeeWeek.daysLabel',
  'employeeWeek.today', 'employeeWeek.free', 'employeeWeek.loading',
  'employeeWeek.errorDescription', 'employeeWeek.retry', 'employeeWeek.shiftLabel',
  'employeeWeek.noLocation',
  'employeeDetail.eyebrow', 'employeeDetail.title', 'employeeDetail.back',
  'employeeDetail.published', 'employeeDetail.date', 'employeeDetail.hours',
  'employeeDetail.acknowledgementPending', 'employeeDetail.acknowledged',
  'employeeDetail.acknowledgeAria', 'employeeDetail.acknowledging',
  'employeeDetail.acknowledgementError',
  'employeeDetail.location', 'employeeDetail.area', 'employeeDetail.noLocation',
  'employeeDetail.noArea', 'employeeDetail.actions', 'employeeDetail.acknowledge',
  'employeeDetail.comment', 'employeeDetail.changeRequest', 'employeeDetail.comingSoon',
  'employeeDetail.loading', 'employeeDetail.errorTitle', 'employeeDetail.errorDescription',
  'employeeDetail.retry',
  'stats.own', 'stats.company', 'stats.totalMonth', 'stats.totalYear', 'stats.month', 'stats.year',
  'calendar.addShiftTitle', 'calendar.addShiftBlockedTitle',
  'shiftModal.titleNew', 'shiftModal.titleEdit', 'shiftModal.dateLabel', 'shiftModal.startLabel',
  'shiftModal.endLabel', 'shiftModal.typeLabel', 'shiftModal.confirm', 'shiftModal.working', 'shiftModal.saveSuccess',
  'importConflict.title', 'importConflict.description', 'importConflict.existing', 'importConflict.incoming',
  'importConflict.skip', 'importConflict.abort', 'importConflict.replace',
  'importModal.title', 'importModal.newImport', 'importModal.nameLabel', 'importModal.idLabel',
  'importModal.monthLabel', 'importModal.yearLabel', 'importModal.uploadTitle', 'importModal.process',
  'importModal.detected', 'importModal.colDate', 'importModal.colOrigin', 'importModal.colType',
  'importModal.colStart', 'importModal.colEnd', 'importModal.emptyStateHint',
  'settings.title', 'settings.tabProfile', 'settings.tabShiftTypes', 'settings.displayName',
  'settings.identifiers', 'settings.employer', 'settings.timezone',
  'settings.saveProfile', 'settings.archive', 'settings.restore', 'settings.newType',
  'privacy.resetTitle', 'privacy.resetButton',
  'legalFooter.terms', 'legalFooter.privacy', 'legalFooter.legal', 'legalFooter.cookies',
  'legalPage.titlePrivacy', 'legalPage.titleTerms', 'legalPage.titleLegal', 'legalPage.backHome',
  'cookies.titleBanner', 'cookies.acceptAll', 'cookies.configure', 'cookies.rejectOptional',
  'errors.UNKNOWN_EMPLOYEE', 'errors.NO_SHIFTS_FOUND', 'errors.UNSUPPORTED_FORMAT',
  'diagnosis.stateReady', 'diagnosis.stateNeedsInput', 'diagnosis.statePartial',
  'diagnosis.stateBlocked', 'diagnosis.stateUnsupported', 'diagnosis.stateFailed',
  'diagnosis.noShifts.title', 'diagnosis.noShifts.reasonNoValues',
  'diagnosis.noShifts.reasonAllCodesUnknown', 'diagnosis.noShifts.reasonEmployeeMissing',
  'diagnosis.noShifts.reasonNoDateAlignment', 'diagnosis.noShifts.reasonUnsupportedLayout',
  'diagnosis.noShifts.reasonUnknown',
  'diagnosis.unknownCodes.message', 'diagnosis.unknownCodes.excludedMessage',
  'diagnosis.unknownCodes.daysList',
  'diagnosis.partial.message', 'diagnosis.partial.daysList',
  'diagnosis.monthMismatch.message', 'diagnosis.monthMismatch.usePeriod', 'diagnosis.monthMismatch.hint',
  'diagnosis.employee.unknownMessage', 'diagnosis.employee.ambiguousMessage',
  'diagnosis.unsupportedLayout.message', 'diagnosis.confirmBlocked', 'diagnosis.nothingImported',
  'diagnosis.error.PARSER_FAILURE', 'diagnosis.error.MALFORMED_INPUT', 'diagnosis.error.EMPTY_DOCUMENT',
  'diagnosis.vlm.VLM_UNAVAILABLE', 'diagnosis.vlm.VLM_TIMEOUT', 'diagnosis.vlm.VLM_RATE_LIMITED',
  'diagnosis.vlm.VLM_INVALID_RESPONSE', 'diagnosis.vlm.VLM_PROVIDER_ERROR', 'diagnosis.vlm.VLM_FILE_TOO_LARGE',
  'importModal.vlmAnalyzing', 'importModal.visualAnalysisBadge',
  'importModal.authRequired',
  'assistant.vacationOption', 'assistant.otherOption', 'assistant.otherTypeLabel', 'assistant.timesRequired',
];

// A subset of T_KEYS that are full words/sentences and must read differently
// per locale. Short technical tokens (ID, UTC, brand line) are excluded —
// those are legitimately identical in both languages.
const SAME_BY_DESIGN_KEYS = ['importModal.idLabel', 'legalFooter.cookies' /* loanwords/abbreviations, identical in es and en */];
const MUST_DIFFER_KEYS = T_KEYS.filter((key) => !SAME_BY_DESIGN_KEYS.includes(key));

describe('no-mixed-language: translation completeness', () => {
  it('every referenced key resolves to a real (non-key-echoing) string in both locales', () => {
    for (const key of T_KEYS) {
      const es = translate('es', key);
      const en = translate('en', key);
      expect(es, `es:${key}`).not.toBe(key);
      expect(en, `en:${key}`).not.toBe(key);
    }
  });

  it('sentence/word-level keys read differently in es vs en (not silently sharing the Spanish default)', () => {
    for (const key of MUST_DIFFER_KEYS) {
      const es = translate('es', key);
      const en = translate('en', key);
      expect(es, `es === en for ${key}`).not.toBe(en);
    }
  });

  it('the month and weekday lists are fully translated (no Spanish leaking into English)', () => {
    const monthsEs = translateList('es', 'calendar.months');
    const monthsEn = translateList('en', 'calendar.months');
    expect(monthsEs).not.toEqual(monthsEn);
    expect(monthsEn).toContain('January');
    expect(monthsEn).not.toContain('Enero');

    // Raw dictionary order is Sunday-first canonical (index 0 = Sunday);
    // display order (Monday-first) is derived via orderWeekdayLabels, see
    // src/lib/week.test.ts and MonthGrid.test.tsx.
    const weekdaysEs = translateList('es', 'calendar.weekdays');
    const weekdaysEn = translateList('en', 'calendar.weekdays');
    expect(weekdaysEs).toEqual(['D', 'L', 'M', 'X', 'J', 'V', 'S']);
    expect(weekdaysEn).toEqual(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);
  });
});

const SOURCE_ROOT = join(process.cwd(), 'src');

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.(tsx?|ts)$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      out.push(full);
    }
  }
  return out;
}

describe('no-mixed-language: residual PDF-only copy', () => {
  it('no component hardcodes "Procesar PDF" (import is format-neutral, not PDF-only)', () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(SOURCE_ROOT)) {
      const content = readFileSync(file, 'utf-8');
      if (/Procesar PDF|Process PDF/i.test(content)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
