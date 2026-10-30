/* eslint-disable react-refresh/only-export-components -- QA-only harness entry, never part of the product bundle */
// QA-only harness (served by `vite`, never part of the product build): renders the F1 import surfaces with synthetic props so they can be
// measured and screenshotted at mobile widths without a backend. `?surface=consent|result|result-published`.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nProvider } from '../../../src/lib/i18n-react';
import { ThemeProvider } from '../../../src/lib/theme-react';
import { FutureImportConsent } from '../../../src/components/shift-dashboard/FutureImportConsent';
import { ImportResultModal } from '../../../src/components/shift-dashboard/ImportResultModal';
import type { PlanImportPreview } from '../../../src/lib/remote';
import '../../../src/index.css';

const preview: PlanImportPreview = {
  classification: 'MIXED', cutoff: '2026-11-02', document: { documentClass: 'PLANNING_DRAFT', confidence: 'high', evidence: [] },
  historicalCount: 12, futureCount: 40, employeeCount: 5,
  plan: { changes: { new: 30, unchanged: 6, modified: 4, requiresReview: 2 }, weeksAffected: ['2026-11-02', '2026-11-09'] },
  autoPublish: {
    eligible: true, willPublishShiftCount: 31,
    weeks: [{ periodStart: '2026-11-02', areaId: null, mode: 'SPLIT', publishCount: 18, retainCount: 1 }],
    willRetain: [{ employeeId: 'e1', date: '2026-11-04', reason: 'REST_RULE_VIOLATION' }],
    reviewConflicts: [{ employeeId: 'e2', date: '2026-11-05', reason: 'REQUIRES_REVIEW' }],
  },
};
const base = { status: 'COMPLETED' as const, historical: { submittedCount: 12, persistedCount: 12, existingCount: 0 }, duplicate: null };
const surface = new URLSearchParams(location.search).get('surface') ?? 'consent';
localStorage.setItem('anclora_shiftimport_locale_v1', new URLSearchParams(location.search).get('lang') ?? 'es');
localStorage.setItem('anclora_theme_mode', new URLSearchParams(location.search).get('theme') ?? 'dark');

function Surface() {
  const [decision, setDecision] = React.useState<'historical-only' | 'historical-and-plan' | 'historical-and-auto-publish'>('historical-and-auto-publish');
  if (surface === 'consent') {
    return <div style={{ padding: 16, maxWidth: 720 }}><FutureImportConsent decision={decision} onChange={setDecision} testId="harness-consent" historicalCount={12} futureCount={40} preview={preview} /></div>;
  }
  const published = surface === 'result-published';
  return (
    <ImportResultModal
      isOpen
      onClose={() => undefined}
      onOpenPlanner={published ? undefined : () => undefined}
      onResolveDifferences={() => undefined}
      report={{
        ...base,
        future: {
          submittedCount: 40, createdAssignmentCount: 40, existingAssignmentCount: 0, affectedWeekCount: 2, publishedWeekCount: 2, publishedShiftCount: published ? 40 : 31,
          publicationResults: [{ periodStart: '2026-11-02', status: published ? 'PUBLISHED' : 'SPLIT', createdShiftCount: 18 }, { periodStart: '2026-11-09', status: 'PUBLISHED', createdShiftCount: 13 }],
          draftWeekCount: published ? 0 : 1,
          retained: published ? [] : [
            { employeeId: 'e1', date: '2026-11-04', reason: 'REST_RULE_VIOLATION' }, { employeeId: 'e3', date: '2026-11-04', reason: 'REST_RULE_VIOLATION' },
            { employeeId: 'e4', date: '2026-11-06', reason: 'MANUAL_CURRENT_PROTECTED' },
          ],
        },
        plan: { autoPublished: true, changes: { new: 30, unchanged: 6, modified: 4, requiresReview: published ? 0 : 2 } },
      }}
    />
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ThemeProvider><I18nProvider><Surface /></I18nProvider></ThemeProvider>,
);
