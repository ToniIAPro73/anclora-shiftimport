// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';
import { ThemeProvider } from '../../lib/theme-react';
import * as remote from '../../lib/remote';
import type { CalendarScheduleShift, ScheduleSnapshot, ScheduleVersion, ShiftAssignment } from '../../lib/remote';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { WeeklyPlanner } from './WeeklyPlanner';
import { plannerAssignmentStatus, plannerDayRows } from './planner-mobile-model';

vi.mock('../../lib/operational-date', () => ({ getOperationalDate: () => '2026-09-25' }));
setupLocalStorageMock();

vi.mock('../../lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/remote')>();
  return {
    ...actual,
    listRemoteScheduleVersions: vi.fn(),
    loadRemoteScheduleSnapshot: vi.fn(),
    createRemoteScheduleDraft: vi.fn(),
    createRemoteScheduleDraftFromVersion: vi.fn(),
    createRemoteAssignment: vi.fn(),
    updateRemoteAssignment: vi.fn(),
    deleteRemoteAssignment: vi.fn(),
    listRemoteScheduleVersionHistory: vi.fn(),
    publishRemoteScheduleVersion: vi.fn(),
  };
});

const version = (overrides: Partial<ScheduleVersion> = {}): ScheduleVersion => ({
  id: 'version-1', scheduleId: 'schedule-1', areaId: 'area-1', versionNumber: 1, status: 'DRAFT', periodStart: '2026-09-28', periodEnd: '2026-10-04', ...overrides,
});
const assignment = (overrides: Partial<ShiftAssignment> = {}): ShiftAssignment => ({
  id: 'a1', scheduleVersionId: 'version-1', employeeId: 'e1', date: '2026-09-28', startTime: '09:00', endTime: '17:00', location: 'Front desk', shiftType: 'Regular', ...overrides,
});
const employees = [
  { id: 'e1', name: 'Ana Planner', externalEmployeeId: 'E001', areaId: 'area-1' },
  { id: 'e2', name: 'Berta Plan', externalEmployeeId: 'E002', areaId: 'area-1' },
];
const snap = (overrides: Partial<ScheduleSnapshot> = {}): ScheduleSnapshot => ({
  version: version(),
  employees,
  assignments: [
    assignment({ id: 'a2', employeeId: 'e1', startTime: '18:00', endTime: '20:00', shiftType: 'Extras' }),
    assignment({ id: 'a1', employeeId: 'e1' }),
    assignment({ id: 'a3', employeeId: 'e2', startTime: '07:00', endTime: '15:00' }),
    assignment({ id: 'a4', employeeId: 'e2', date: '2026-09-29' }),
  ],
  calendarShifts: [],
  ...overrides,
});

const mockCompact = (matches: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: matches && query.includes('max-width: 640px'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }),
  });
};

function renderPlanner() {
  return render(
    <ThemeProvider><I18nProvider><WeeklyPlanner areaId="area-1" canEdit initialPeriodStart="2026-09-28" initialDate="2026-09-28" onBack={() => {}} /></I18nProvider></ThemeProvider>,
  );
}
const mockedList = vi.mocked(remote.listRemoteScheduleVersions);
const mockedLoad = vi.mocked(remote.loadRemoteScheduleSnapshot);

beforeEach(() => { vi.clearAllMocks(); window.localStorage.clear(); mockCompact(true); });
afterEach(() => { cleanup(); mockCompact(false); });

describe('planner-mobile-model', () => {
  it('orders rows deterministically: employees in snapshot order, assignments by start time, calendar shifts last', () => {
    const byCell = new Map<string, ShiftAssignment[]>([
      ['e1:2026-09-28', [assignment({ id: 'late', startTime: '18:00' }), assignment({ id: 'early', startTime: '08:00' })]],
      ['e2:2026-09-28', [assignment({ id: 'other', employeeId: 'e2' })]],
    ]);
    const cal = new Map<string, CalendarScheduleShift[]>([['e1:2026-09-28', [{ id: 'c1', employeeId: 'e1', date: '2026-09-28', shiftType: 'Regular', startTime: '10:00', endTime: '12:00', location: null } as CalendarScheduleShift]]]);
    expect(plannerDayRows('2026-09-28', employees, byCell, cal).map((row) => row.key)).toEqual(['a:early', 'a:late', 'c:c1', 'a:other']);
  });

  it('reads status like plannerCounts: a draft holds plans, any other version reports what the publication materialised', () => {
    expect(plannerAssignmentStatus('DRAFT', { staleAgainstCalendar: false, excludedFromPublication: false })).toBe('draft');
    expect(plannerAssignmentStatus('DRAFT', { staleAgainstCalendar: true, excludedFromPublication: false })).toBe('stale');
    expect(plannerAssignmentStatus('PUBLISHED', { staleAgainstCalendar: false, excludedFromPublication: false })).toBe('published');
    expect(plannerAssignmentStatus('PUBLISHED', { staleAgainstCalendar: false, excludedFromPublication: true })).toBe('excluded');
  });
});

describe('WeeklyPlanner compact (≤640px)', () => {
  it('opens on the Agenda with the status strip, filters, view switch and Manage; no desktop toolbar', async () => {
    mockedList.mockResolvedValue([version()]);
    mockedLoad.mockResolvedValue(snap());
    renderPlanner();
    await screen.findByTestId('planner-agenda');
    expect(screen.getByTestId('weekly-planner')).toHaveAttribute('data-compact', 'true');
    expect(screen.getByTestId('planner-view-agenda')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('planner-manage-open')).toBeInTheDocument();
    expect(document.querySelector('.weekly-planner__toolbar')).toBeNull();
    expect(screen.getByRole('group', { name: 'Días de la semana' }).querySelectorAll('button')).toHaveLength(7);
    expect(screen.getByTestId('planner-agenda-count')).toHaveTextContent('3 asignaciones');
  });

  it('lists the two assignments of the same employee separately and changes the panel with the day', async () => {
    mockedList.mockResolvedValue([version()]);
    mockedLoad.mockResolvedValue(snap());
    renderPlanner();
    await screen.findByTestId('planner-agenda');
    expect(document.querySelectorAll('[data-testid^="planner-agenda-row-a"]')).toHaveLength(3);
    fireEvent.click(screen.getByTestId('planner-day-2026-09-29'));
    expect(screen.getByTestId('planner-agenda')).toHaveAttribute('data-date', '2026-09-29');
    expect(document.querySelectorAll('[data-testid^="planner-agenda-row-a"]')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('planner-day-2026-09-30'));
    expect(screen.getByTestId('planner-agenda-empty')).toHaveTextContent('Sin asignaciones este día');
  });

  it('draft: add is available and a row opens the existing editor; published: read-only detail, no add', async () => {
    mockedList.mockResolvedValue([version()]);
    mockedLoad.mockResolvedValue(snap());
    renderPlanner();
    await screen.findByTestId('planner-agenda');
    expect(screen.getByTestId('planner-agenda-add')).toBeEnabled();
    fireEvent.click(screen.getByTestId('planner-agenda-row-a1'));
    expect(await screen.findByRole('dialog', { name: 'Editar turno' })).toBeInTheDocument();
    cleanup();

    mockedList.mockResolvedValue([version({ status: 'PUBLISHED' })]);
    mockedLoad.mockResolvedValue(snap({ version: version({ status: 'PUBLISHED' }), assignments: [assignment({ excludedFromPublication: true })] }));
    renderPlanner();
    await screen.findByTestId('planner-agenda');
    expect(screen.queryByTestId('planner-agenda-add')).toBeNull();
    expect(within(screen.getByTestId('planner-agenda-row-a1')).getByText('Excluido')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('planner-agenda-row-a1'));
    expect(await screen.findByTestId('planner-detail')).toHaveTextContent('Excluido');
    expect(screen.queryByRole('dialog', { name: 'Editar turno' })).toBeNull();
  });

  it('Manage offers only what the version allows: published → history/new version/pending; draft → history/pending/copy/publish', async () => {
    mockedList.mockResolvedValue([version({ status: 'PUBLISHED' })]);
    mockedLoad.mockResolvedValue(snap({ version: version({ status: 'PUBLISHED' }) }));
    renderPlanner();
    await screen.findByTestId('planner-agenda');
    fireEvent.click(screen.getByTestId('planner-manage-open'));
    const ids = (root: HTMLElement) => Array.from(root.querySelectorAll('[data-testid^="planner-manage-"]')).map((el) => el.getAttribute('data-testid')).filter((id) => id && !/close|actions/.test(id));
    expect(ids(screen.getByTestId('planner-manage-actions'))).toEqual(['planner-manage-history', 'planner-manage-version', 'planner-manage-pending']);
    cleanup();

    mockedList.mockResolvedValue([version()]);
    mockedLoad.mockResolvedValue(snap());
    renderPlanner();
    await screen.findByTestId('planner-agenda');
    fireEvent.click(screen.getByTestId('planner-manage-open'));
    expect(ids(screen.getByTestId('planner-manage-actions'))).toEqual(['planner-manage-history', 'planner-manage-pending', 'planner-manage-copy', 'planner-manage-publish']);
  });

  it('Manage → history opens the existing history dialog and the sheet closes', async () => {
    mockedList.mockResolvedValue([version()]);
    mockedLoad.mockResolvedValue(snap());
    vi.mocked(remote.listRemoteScheduleVersionHistory).mockResolvedValue([]);
    renderPlanner();
    await screen.findByTestId('planner-agenda');
    fireEvent.click(screen.getByTestId('planner-manage-open'));
    fireEvent.click(screen.getByTestId('planner-manage-history'));
    await waitFor(() => expect(remote.listRemoteScheduleVersionHistory).toHaveBeenCalledWith('schedule-1'));
    expect(screen.queryByTestId('planner-manage-actions')).toBeNull();
  });

  it('Table view is a real table (employees × 7 days); a cell with several assignments opens a sheet that lists them; the choice persists apart from desktop', async () => {
    mockedList.mockResolvedValue([version()]);
    mockedLoad.mockResolvedValue(snap());
    renderPlanner();
    await screen.findByTestId('planner-agenda');
    fireEvent.click(screen.getByTestId('planner-view-matrix'));
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(8);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    fireEvent.click(screen.getByTestId('planner-cell-e1-2026-09-28'));
    expect(within(await screen.findByTestId('planner-cell-rows')).getAllByRole('listitem')).toHaveLength(2);
    expect(window.localStorage.getItem('anclora_shiftimport_planner_view_mobile_v1')).toBe('matrix');
    expect(window.localStorage.getItem('anclora_shiftimport_planner_view_v1')).toBe('grid');
  });

  it('keeps the desktop planner untouched when the viewport is wide', async () => {
    mockCompact(false);
    mockedList.mockResolvedValue([version()]);
    mockedLoad.mockResolvedValue(snap());
    renderPlanner();
    await screen.findByRole('row', { name: /Ana Planner/ });
    expect(screen.getByTestId('weekly-planner')).not.toHaveAttribute('data-compact');
    expect(screen.queryByTestId('planner-agenda')).toBeNull();
    expect(document.querySelector('.weekly-planner__toolbar')).not.toBeNull();
  });
});
