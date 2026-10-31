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
import { MonthGrid } from '../../../src/components/shift-dashboard/MonthGrid';
import { DayProvenancePanel } from '../../../src/components/shift-dashboard/DayProvenancePanel';
import { ReconciliationModal } from '../../../src/components/shift-dashboard/ReconciliationModal';
import { WeeklyPlanner } from '../../../src/components/scheduling/WeeklyPlanner';
import type { Shift } from '../../../src/lib/types';
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

// ---- F3 surfaces: approved vacation in the calendar / day / reconciliation list / planner (API mocked in the page) ----
// A Monday ≥ 30 days ahead: the planner week and the vacation share the same days and none of them is in the past.
const f3Base = (() => {
  // The first Monday on/after the 8th of the month that starts ≥ 30 days from now: days 0..10 stay inside ONE month (calendar + chips).
  const later = addDays(getOperationalDate(), 30);
  let date = `${later.slice(0, 7)}-08`;
  if (date < later) date = `${addDays(`${later.slice(0, 7)}-28`, 10).slice(0, 7)}-08`;
  while (new Date(`${date}T00:00:00Z`).getUTCDay() !== 1) date = addDays(date, 1);
  return date;
})();
const f3Day = (n: number) => addDays(f3Base, n);
const f3Month = { year: Number(f3Base.slice(0, 4)), month: Number(f3Base.slice(5, 7)) - 1 };
const f3Range = { startDate: f3Day(0), endDate: f3Day(6) };
const f3Shift = (id: string, date: string, shiftType: string, patch: Partial<Shift> = {}): Shift => ({
  id, date, startTime: '', endTime: '', location: shiftType, origin: 'MAN', shiftType, countsAsWork: false, layer: 'CHANGE', effectiveState: 'EFFECTIVE', ...patch,
});
function F3Calendar() {
  const query = new URLSearchParams(location.search);
  const role = (query.get('role') ?? 'ADMIN') as 'ADMIN' | 'PLANNER';
  const shifts: Shift[] = [
    ...[0, 1, 2, 3].map((n) => f3Shift(`v${n}`, f3Day(n), 'Vacaciones', { provenance: 'EMPLOYEE_REQUEST', timeOffRequestId: 'req-1' })),
    f3Shift('p1', f3Day(1), 'Regular', { startTime: '05:00', endTime: '13:00', origin: 'IMP', countsAsWork: true, provenance: 'SYSTEM', effectiveState: 'REQUIRES_REVIEW' }),
    f3Shift('m1', f3Day(5), 'Regular', { startTime: '05:00', endTime: '13:00', countsAsWork: true, provenance: 'MANUAL_ADMIN_CHANGE' }),
  ];
  return (
    <MonthGrid
      year={f3Month.year} month={f3Month.month} shifts={shifts} role={role} employeeId="e1" provenanceEnabled canReconcile
      onEditShift={() => undefined} onCreateShift={() => undefined}
      pendingTimeOff={[{ id: 'pending-1', startDate: f3Day(8), endDate: f3Day(10) }]}
    />
  );
}
function installF3Mocks() {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const row = (id: string, shiftType: string, effectiveState: string, patch: Record<string, unknown> = {}) => ({ id, shiftType, startTime: null, endTime: null, effectiveState, layer: 'CHANGE', ...patch });
  const conflict = new URLSearchParams(location.search).get('state') !== 'protected';
  const absence = { ...f3Range, timeOffRequestId: 'req-1', shiftId: 'abs' };
  const version = { id: 'v1', scheduleId: 's1', areaId: null, versionNumber: 1, status: 'DRAFT', periodStart: f3Day(0), periodEnd: f3Day(6) };
  window.fetch = async (input, init) => {
    const url = new URL(String(input), location.origin);
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.pathname === '/api/calendar/changes' && method === 'GET') {
      return json(200, {
        employeeId: 'e1', date: f3Day(1),
        rows: conflict ? [row('abs', 'Vacaciones', 'EFFECTIVE', { timeOffRequestId: 'req-1' }), row('prop', 'Regular', 'REQUIRES_REVIEW', { startTime: '05:00', endTime: '13:00' })] : [row('abs', 'Vacaciones', 'EFFECTIVE', { timeOffRequestId: 'req-1' })],
        changes: [],
        provenance: {
          requiresReview: conflict, effective: [row('abs', 'Vacaciones', 'EFFECTIVE')], current: [row('abs', 'Vacaciones', 'EFFECTIVE')],
          proposed: conflict ? [row('prop', 'Regular', 'REQUIRES_REVIEW', { startTime: '05:00', endTime: '13:00' })] : [], countedProvisionally: false, legacyDutyRows: [],
        },
        protectedAbsence: absence, replacedAbsence: null, conflictsWithApprovedVacation: conflict,
      });
    }
    if (url.pathname === '/api/calendar/changes' && method === 'POST') {
      const forbidden = new URLSearchParams(location.search).get('role') === 'PLANNER';
      return forbidden ? json(403, { error: 'Only an owner or administrator can replace an approved vacation', code: 'PROTECTED_ABSENCE_OVERRIDE_FORBIDDEN' }) : json(201, { result: { changeId: 'c1' } });
    }
    if (url.pathname === '/api/schedules') return json(200, { schedules: [version] });
    if (url.pathname.startsWith('/api/schedules/s1/versions/v1')) {
      return json(200, {
        version, employees: [{ id: 'e1', name: 'Ana Planner', externalEmployeeId: 'E001', areaId: null }, { id: 'e2', name: 'Luis Plan', externalEmployeeId: 'E002', areaId: null }],
        assignments: [{ id: 'a1', scheduleVersionId: 'v1', employeeId: 'e2', date: f3Day(1), startTime: '05:00', endTime: '13:00', location: 'Recepción', shiftType: 'Regular', countsAsWork: true }],
        calendarShifts: [1, 2, 3].map((n) => ({ id: `cv${n}`, employeeId: 'e1', date: f3Day(n), startTime: null, endTime: null, location: 'Vacaciones', shiftType: 'Vacaciones', countsAsWork: false, timeOffRequestId: 'req-1' })),
      });
    }
    return json(404, { error: 'Not found' });
  };
}
const reconItem = {
  date: f3Day(1), status: 'PENDING' as const, current: [{ type: 'Vacaciones', startTime: null, endTime: null }], proposed: [{ type: 'Regular', startTime: '05:00', endTime: '13:00' }],
  reasonCode: 'APPROVED_VACATION_CONFLICT', protectedAbsence: { timeOffRequestId: 'req-1', ...f3Range }, resolvedAt: null, resolvedReason: null, selfChange: null,
};
function F3Surface() {
  installF3Mocks();
  const query = new URLSearchParams(location.search);
  const kind = query.get('surface');
  // `allow=1` forces the button on while the mocked server still answers 403 (what a stale client would hit).
  const canOverride = (query.get('role') ?? 'ADMIN') !== 'PLANNER' || query.get('allow') === '1';
  if (kind === 'f3-calendar') return <main style={{ padding: 12 }} data-testid="harness-f3"><F3Calendar /></main>;
  if (kind === 'f3-day') return <main style={{ padding: 12, maxWidth: 560 }} data-testid="harness-f3"><DayProvenancePanel employeeId="e1" date={f3Day(1)} canReconcile canOverrideProtectedAbsence={canOverride} /></main>;
  if (kind === 'f3-recon') {
    return <ReconciliationModal isOpen worklist={{ employeeId: 'e1', year: f3Month.year, pendingCount: 1, resolvedCount: 0, items: [reconItem] }} loading={false} failed={false} onClose={() => undefined} onRetry={() => undefined} onReview={() => undefined} onViewDay={() => undefined} />;
  }
  return <main style={{ padding: 8 }} data-testid="harness-f3"><WeeklyPlanner areaId={null} canEdit initialPeriodStart={f3Day(0)} /></main>;
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
  <ThemeProvider><I18nProvider>{surface === 'time-off' ? <TimeOffSurface /> : surface.startsWith('f3-') ? <F3Surface /> : <Surface />}</I18nProvider></ThemeProvider>,
);
