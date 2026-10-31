/* eslint-disable react-refresh/only-export-components -- QA-only harness entry, never part of the product bundle */
// QA-only harness (served by `vite`, never part of the product build): renders the F1 import surfaces with synthetic props so they can be
// measured and screenshotted at mobile widths without a backend. `?surface=consent|result|result-published`.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nProvider } from '../../../src/lib/i18n-react';
import { ThemeProvider } from '../../../src/lib/theme-react';
import { FutureImportConsent } from '../../../src/components/shift-dashboard/FutureImportConsent';
import { ImportResultModal } from '../../../src/components/shift-dashboard/ImportResultModal';
import type { PlanImportPreview, TimeOffRequest } from '../../../src/lib/remote';
import { TimeOffRequests } from '../../../src/components/requests/TimeOffRequests';
import { getOperationalDate } from '../../../src/lib/operational-date';
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

// ---- F2 time-off surface: the whole `/api/me/time-off-requests*` contract is mocked in the page (no backend, no database) ----
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
function installTimeOffMock() {
  const today = getOperationalDate();
  const mk = (patch: Partial<TimeOffRequest>): TimeOffRequest => ({
    id: 'r', requestType: 'VACATION', startDate: addDays(today, 20), endDate: addDays(today, 26), requestedDays: 7, comment: '', status: 'PENDING',
    createdAt: `${today}T09:00:00.000Z`, resolvedAt: null, resolvedByName: null, rejectionReason: null, history: [{ type: 'CREATED', at: `${today}T09:00:00.000Z` }], ...patch,
  });
  const empty = new URLSearchParams(location.search).get('data') === 'empty';
  const requests: TimeOffRequest[] = empty ? [] : [
    mk({ id: 'r1', comment: 'Viaje familiar con los abuelos y los primos, vuelta el domingo por la tarde' }),
    mk({ id: 'r2', status: 'APPROVED', startDate: addDays(today, -3), endDate: addDays(today, 3), requestedDays: 7, resolvedAt: `${today}T10:00:00.000Z`, resolvedByName: 'Ana García',
      appliedStartDate: today, appliedDays: 4, skippedPastDays: 3, history: [{ type: 'CREATED', at: `${addDays(today, -10)}T09:00:00.000Z` }, { type: 'APPROVED', at: `${today}T10:00:00.000Z`, byName: 'Ana García' }] }),
    mk({ id: 'r3', status: 'REJECTED', startDate: addDays(today, 40), endDate: addDays(today, 42), requestedDays: 3, rejectionReason: 'Hay cobertura mínima esa semana', resolvedAt: `${today}T11:00:00.000Z`,
      history: [{ type: 'CREATED', at: `${today}T09:00:00.000Z` }, { type: 'REJECTED', at: `${today}T11:00:00.000Z`, reason: 'Hay cobertura mínima esa semana' }] }),
    mk({ id: 'r4', status: 'CANCELLED', startDate: addDays(today, 60), endDate: addDays(today, 61), requestedDays: 2, history: [{ type: 'CREATED', at: `${today}T09:00:00.000Z` }, { type: 'CANCELLED', at: `${today}T12:00:00.000Z` }] }),
  ];
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (input, init) => {
    const url = new URL(String(input), location.origin);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.pathname === '/api/me/time-off-requests/impact') {
      const start = url.searchParams.get('startDate') ?? '';
      const overlap = start === addDays(today, 20);
      return json(200, { publishedShifts: 3, draftAssignments: 1, overlapsOwn: overlap ? [{ id: 'r1', startDate: addDays(today, 20), endDate: addDays(today, 26), status: 'PENDING' }] : [] });
    }
    if (url.pathname.endsWith('/cancel') && method === 'POST') return json(200, { request: { ...requests[0], status: 'CANCELLED' } });
    if (url.pathname === '/api/me/time-off-requests' && method === 'POST') return json(201, { request: mk({ id: 'new', ...JSON.parse(String(init?.body ?? '{}')) }) });
    if (url.pathname === '/api/me/time-off-requests') {
      return json(200, { requests, summary: { approvedDaysInYear: empty ? 0 : 4, pendingDays: empty ? 0 : 7, activeCount: empty ? 0 : 2 } });
    }
    return json(404, { error: 'Not found' });
  };
}
const base = { status: 'COMPLETED' as const, historical: { submittedCount: 12, persistedCount: 12, existingCount: 0 }, duplicate: null };
const surface = new URLSearchParams(location.search).get('surface') ?? 'consent';
localStorage.setItem('anclora_shiftimport_locale_v1', new URLSearchParams(location.search).get('lang') ?? 'es');
localStorage.setItem('anclora_theme_mode', new URLSearchParams(location.search).get('theme') ?? 'dark');

function TimeOffSurface() {
  installTimeOffMock();
  return <main style={{ padding: 16, maxWidth: 760 }} data-testid="harness-time-off"><TimeOffRequests /></main>;
}

function Surface() {
  const [decision, setDecision] = React.useState<'historical-only' | 'historical-and-plan' | 'historical-and-auto-publish'>('historical-and-auto-publish');
  if (surface === 'consent') {
    return <div style={{ padding: 16, maxWidth: 720 }}><FutureImportConsent decision={decision} onChange={setDecision} testId="harness-consent" historicalCount={12} futureCount={40} preview={preview} /></div>;
  }
  const published = surface === 'result-published';
  return (
    <ImportResultModal
      isOpen
      onClose={() => { document.body.dataset.closed = '1'; }}
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
  <ThemeProvider><I18nProvider>{surface === 'time-off' ? <TimeOffSurface /> : <Surface />}</I18nProvider></ThemeProvider>,
);
