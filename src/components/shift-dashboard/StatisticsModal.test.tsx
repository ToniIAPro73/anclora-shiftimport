// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';
import type { Shift } from '../../lib/types';
import { StatisticsModal } from './StatisticsModal';

afterEach(cleanup);
beforeEach(() => window.localStorage?.setItem?.('anclora_shiftimport_locale_v1', 'es'));

const shift = (id: string, date: string, shiftType: string, startTime = '', endTime = ''): Shift => ({
  id, date, startTime, endTime, shiftType, location: shiftType, origin: 'IMP',
});

const feb = [
  shift('a', '2026-02-06', 'Regular', '13:00', '20:00'),
  shift('b', '2026-02-06', 'Extras', '20:00', '21:00'),
  shift('c', '2026-02-06', 'JT', '13:00', '21:00'),
  shift('g', '2026-02-10', 'Libre'),
];

function renderModal(overrides: Partial<React.ComponentProps<typeof StatisticsModal>> = {}) {
  const onClose = vi.fn();
  const utils = render(
    <I18nProvider>
      <StatisticsModal
        isOpen
        onClose={onClose}
        employeeId={null}
        employeeExternalId={null}
        organizationId={null}
        year={2026}
        month={1}
        monthLabel="Febrero 2026"
        today="2026-10-16"
        target={null}
        canConfigureTarget
        showContract
        localMonthShifts={feb}
        localYearShifts={feb}
        onConfigureTarget={vi.fn()}
        {...overrides}
      />
    </I18nProvider>,
  );
  return { onClose, ...utils };
}

describe('StatisticsModal', () => {
  it('is a labelled dialog with month / year / target tabs', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: 'Estadísticas' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('tab', { name: 'Mes seleccionado' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Año 2026' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Objetivo anual' })).toBeInTheDocument();
  });

  it('month tab computes effective hours with JT adding nothing (union, not sum)', () => {
    renderModal();
    expect(screen.getByTestId('eff-month-effective')).toHaveTextContent('8 h');
    expect(screen.getByTestId('eff-month-regular')).toHaveTextContent('7 h');
    expect(screen.getByTestId('eff-month-extras')).toHaveTextContent('1 h');
    expect(screen.getByTestId('eff-month-free-days')).toHaveTextContent('1 d');
  });

  it('uses only target-selected shift types in totals and keeps each type metric visible', () => {
    renderModal({
      target: { minimumAnnualMinutes: 0, maximumAnnualMinutes: 100_000, includedShiftTypes: ['Regular'] },
    });
    expect(screen.getByTestId('eff-month-effective')).toHaveTextContent('7 h');
    expect(screen.getByTestId('eff-month-regular')).toHaveTextContent('7 h');
    expect(screen.getByTestId('eff-month-extras')).toHaveTextContent('1 h');
    fireEvent.click(screen.getByRole('tab', { name: 'Objetivo anual' }));
    expect(screen.getByTestId('eff-contract-effective')).toHaveTextContent('7 h');
    expect(screen.getByTestId('eff-contract-extras')).toHaveTextContent('1 h');
  });

  it('includes all work types when no annual target is configured', () => {
    renderModal();
    expect(screen.getByTestId('eff-month-effective')).toHaveTextContent('8 h');
    expect(screen.getByTestId('eff-month-extras')).toHaveTextContent('1 h');
  });

  it('year tab switches panel and keeps realised apart from planned', () => {
    renderModal({ today: '2026-02-01' });
    fireEvent.click(screen.getByRole('tab', { name: 'Año 2026' }));
    expect(screen.getByTestId('eff-year-effective')).toHaveTextContent('0 h');
    expect(screen.getByTestId('eff-year-planned')).toHaveTextContent('8 h');
  });

  it('arrow keys move between tabs', () => {
    renderModal();
    const month = screen.getByRole('tab', { name: 'Mes seleccionado' });
    month.focus();
    fireEvent.keyDown(month, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Año 2026' })).toHaveAttribute('aria-selected', 'true');
  });

  it('unconfigured target offers configuration instead of a verdict', () => {
    const onConfigureTarget = vi.fn();
    renderModal({ onConfigureTarget });
    fireEvent.click(screen.getByRole('tab', { name: 'Objetivo anual' }));
    expect(screen.getByTestId('eff-contract-unconfigured')).toHaveTextContent('Sin configurar');
    fireEvent.click(screen.getByTestId('eff-contract-configure'));
    expect(onConfigureTarget).toHaveBeenCalled();
  });

  it('configured target shows an accessible progress bar and margins', () => {
    renderModal({ target: { minimumAnnualMinutes: 100 * 60, maximumAnnualMinutes: 110 * 60 } });
    fireEvent.click(screen.getByRole('tab', { name: 'Objetivo anual' }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '480');
    expect(screen.getByTestId('eff-contract-status')).toHaveAttribute('data-status', 'BELOW_MINIMUM');
    expect(screen.getByTestId('eff-contract-margin-remaining')).toBeInTheDocument();
  });

  it('a configured year with no calendar rows is NO_DATA, never "0 h = below minimum"', () => {
    renderModal({
      year: 2025, month: 0, monthLabel: 'Enero 2025', localMonthShifts: [], localYearShifts: [],
      target: { minimumAnnualMinutes: 1529 * 60, maximumAnnualMinutes: 1540 * 60 },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Año 2025' }));
    expect(screen.getByTestId('eff-year-no-data')).toHaveTextContent('Sin datos de calendario');
    fireEvent.click(screen.getByRole('tab', { name: 'Objetivo anual' }));
    expect(screen.getByTestId('eff-contract-range')).toHaveTextContent('1529–1540 h');
    expect(screen.getByTestId('eff-contract-status')).toHaveAttribute('data-status', 'NO_DATA');
    expect(screen.getByTestId('eff-contract-status')).toHaveTextContent('No evaluable');
    expect(screen.queryByText(/Faltan/)).toBeNull();
  });

  it('Escape and the close button dismiss it', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('stats-modal-close'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does not render the legacy Propios / Empresa accumulators', () => {
    renderModal();
    expect(screen.queryByText(/Propios/)).toBeNull();
    expect(screen.queryByText(/^Empresa$/)).toBeNull();
  });

  it('loads from the effective-calendar API for backend sessions', async () => {
    const remote = await import('../../lib/remote');
    const bucket = {
      effectiveMinutes: 4320, regularMinutes: 4320, extrasMinutes: 0, otherWorkMinutes: 0, unclassifiedWorkMinutes: 0,
      absenceMinutes: 0, dutyMinutes: 0, dutyDays: 0, workedDays: 9, freeDays: 6, vacationDays: 0, sickLeaveDays: 0,
    };
    const spy = vi.spyOn(remote, 'loadCalendarStats').mockResolvedValue({
      employeeId: 'e1', year: 2026, today: '2026-10-16', calendarRows: 50,
      total: bucket, realized: bucket, planned: { ...bucket, effectiveMinutes: 5760 },
      unresolvedDays: 0,
      monthStats: { month: 10, realized: bucket, planned: { ...bucket, effectiveMinutes: 5760 } },
      target: null, contract: { status: 'UNCONFIGURED', effectiveMinutes: 4320 },
      projection: { realizedMinutes: 4320, plannedMinutes: 5760, projectedMinutes: 10080 },
    } as never);
    renderModal({ employeeId: 'e1', month: 9, monthLabel: 'Octubre 2026' });
    await waitFor(() => expect(screen.getByTestId('eff-month-effective')).toHaveTextContent('72 h'));
    expect(spy).toHaveBeenCalledWith('e1', 2026, 10);
    expect(screen.getByTestId('eff-month-planned')).toHaveTextContent('96 h');
    spy.mockRestore();
  });

  it('discloses provisional review days in month, year and annual target', async () => {
    const remote = await import('../../lib/remote');
    const bucket = {
      effectiveMinutes: 480, regularMinutes: 480, extrasMinutes: 0, otherWorkMinutes: 0, unclassifiedWorkMinutes: 0,
      absenceMinutes: 0, dutyMinutes: 0, dutyDays: 0, workedDays: 1, freeDays: 0, vacationDays: 0, sickLeaveDays: 0,
    };
    const spy = vi.spyOn(remote, 'loadCalendarStats').mockResolvedValue({
      employeeId: 'e1', year: 2026, today: '2026-10-16', calendarRows: 50,
      total: bucket, realized: bucket, planned: bucket, unresolvedDays: 3,
      totalReviewDays: 3, provisionalReviewDays: 3, provisionalReviewMinutes: 1440, unresolvedUncountedDays: 0,
      realizedProvisionalReviewDays: 2, plannedProvisionalReviewDays: 1,
      realizedProvisionalReviewMinutes: 960, plannedProvisionalReviewMinutes: 480,
      monthStats: {
        month: 10, realized: bucket, planned: bucket, totalReviewDays: 2, provisionalReviewDays: 2,
        provisionalReviewMinutes: 960, unresolvedUncountedDays: 0, realizedProvisionalReviewDays: 2,
        plannedProvisionalReviewDays: 0, realizedProvisionalReviewMinutes: 960, plannedProvisionalReviewMinutes: 0,
      },
      target: null, contract: { status: 'UNCONFIGURED', effectiveMinutes: 480 },
      projection: { realizedMinutes: 480, plannedMinutes: 480, projectedMinutes: 960 },
    } as never);
    renderModal({ employeeId: 'e1', month: 9, monthLabel: 'Octubre 2026' });
    await waitFor(() => expect(screen.getByTestId('eff-month-provisional-notice')).toHaveTextContent('Incluye 2 días pendientes'));
    fireEvent.click(screen.getByRole('tab', { name: 'Año 2026' }));
    expect(screen.getByTestId('eff-year-provisional-notice')).toHaveTextContent('Incluye 3 días pendientes');
    fireEvent.click(screen.getByRole('tab', { name: 'Objetivo anual' }));
    expect(screen.getByTestId('eff-contract-provisional-notice')).toHaveTextContent('Incluye 3 días pendientes');
    spy.mockRestore();
  });

  it('reloads definitive statistics when reconciliation refreshKey changes', async () => {
    const remote = await import('../../lib/remote');
    const bucket = (minutes: number) => ({
      effectiveMinutes: minutes, regularMinutes: minutes, extrasMinutes: 0, otherWorkMinutes: 0, unclassifiedWorkMinutes: 0,
      absenceMinutes: 0, dutyMinutes: 0, dutyDays: 0, workedDays: 1, freeDays: 0, vacationDays: 0, sickLeaveDays: 0,
    });
    const payload = (minutes: number, pendingDays: number) => ({
      employeeId: 'e1', year: 2026, today: '2026-10-16', calendarRows: 50,
      total: bucket(minutes), realized: bucket(minutes), planned: bucket(0), unresolvedDays: pendingDays,
      totalReviewDays: pendingDays, provisionalReviewDays: pendingDays, provisionalReviewMinutes: pendingDays * 60,
      unresolvedUncountedDays: 0, realizedProvisionalReviewDays: pendingDays, plannedProvisionalReviewDays: 0,
      realizedProvisionalReviewMinutes: pendingDays * 60, plannedProvisionalReviewMinutes: 0,
      monthStats: { month: 10, realized: bucket(minutes), planned: bucket(0), totalReviewDays: pendingDays, provisionalReviewDays: pendingDays, provisionalReviewMinutes: pendingDays * 60, unresolvedUncountedDays: 0, realizedProvisionalReviewDays: pendingDays, plannedProvisionalReviewDays: 0, realizedProvisionalReviewMinutes: pendingDays * 60, plannedProvisionalReviewMinutes: 0 },
      target: null, contract: { status: 'UNCONFIGURED', effectiveMinutes: minutes },
      projection: { realizedMinutes: minutes, plannedMinutes: 0, projectedMinutes: minutes },
    });
    const spy = vi.spyOn(remote, 'loadCalendarStats').mockResolvedValueOnce(payload(480, 1) as never).mockResolvedValueOnce(payload(360, 0) as never);
    const { rerender } = renderModal({ employeeId: 'e1', month: 9, monthLabel: 'Octubre 2026', refreshKey: 0 });
    await waitFor(() => expect(screen.getByTestId('eff-month-effective')).toHaveTextContent('8 h'));
    rerender(
      <I18nProvider>
        <StatisticsModal isOpen onClose={vi.fn()} employeeId="e1" year={2026} month={9} monthLabel="Octubre 2026" today="2026-10-16" target={null} canConfigureTarget showContract refreshKey={1} />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('eff-month-effective')).toHaveTextContent('6 h'));
    expect(screen.queryByTestId('eff-month-provisional-notice')).toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('shows a hero metric and a color-tokenised metric grid (calendar shift tokens, no hardcoded hex)', () => {
    const { container } = renderModal();
    expect(container.querySelector('.hero-metric')).not.toBeNull();
    const regular = screen.getByTestId('eff-month-regular');
    expect(regular.getAttribute('style')).toContain('var(--shift-regular-border)');
    expect(screen.getByTestId('eff-month-extras').getAttribute('style')).toContain('var(--shift-overtime-border)');
    expect(screen.getByTestId('eff-month-free-days').getAttribute('style')).toContain('var(--shift-day-off-border)');
    expect(screen.getByTestId('eff-month-vacation-days').getAttribute('style')).toContain('var(--shift-vacation-border)');
    expect(screen.getByTestId('eff-month-sick-days').getAttribute('style')).toContain('var(--shift-leave-border)');
    // worked days is not a shift type: neutral accent, never a shift color
    expect(screen.getByTestId('eff-month-worked-days').getAttribute('style')).not.toContain('--shift-');
    for (const element of container.querySelectorAll('[style]')) expect(element.getAttribute('style')).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it('planned future is a separate secondary card', () => {
    renderModal({ today: '2026-02-01' });
    const planned = screen.getByTestId('eff-month-planned');
    expect(planned.className).toContain('planned-card');
    expect(planned).toHaveTextContent('Planificado futuro (resto del mes)');
  });

  it('shows the planned bucket as the primary statistics for a future month', () => {
    const november = Array.from({ length: 10 }, (_, index) =>
      shift(`nov-${index}`, `2026-11-${String(index + 1).padStart(2, '0')}`, 'Regular', '08:00', '14:12'));
    renderModal({
      today: '2026-10-19', month: 10, monthLabel: 'Noviembre 2026',
      localMonthShifts: november, localYearShifts: november,
    });

    expect(screen.getByText('Horas planificadas')).toBeInTheDocument();
    expect(screen.getByTestId('eff-month-effective')).toHaveTextContent('62 h');
    expect(screen.getByTestId('eff-month-regular')).toHaveTextContent('62 h');
    expect(screen.getByTestId('eff-month-worked-days')).toHaveTextContent('Días planificados');
    expect(screen.getByTestId('eff-month-worked-days')).toHaveTextContent('10 d');
    expect(screen.queryByText('Horas efectivas hasta hoy')).toBeNull();
    expect(screen.queryByTestId('eff-month-planned')).toBeNull();
    expect(screen.queryByTestId('eff-month-no-data')).toBeNull();
    expect(screen.getAllByText('62 h')).toHaveLength(2);
  });

  it('keeps realized and remaining planned hours separate in the current month', () => {
    renderModal({
      today: '2026-10-19', year: 2026, month: 9, monthLabel: 'Octubre 2026',
      localMonthShifts: [
        shift('past-oct', '2026-10-05', 'Regular', '08:00', '15:00'),
        shift('today-oct', '2026-10-19', 'Regular', '05:00', '13:00'),
        shift('future-oct', '2026-10-22', 'Regular', '08:00', '13:00'),
      ],
    });
    expect(screen.getByText('Horas efectivas hasta hoy')).toBeInTheDocument();
    expect(screen.getByTestId('eff-month-effective')).toHaveTextContent('7 h');
    expect(screen.getByTestId('eff-month-planned')).toHaveTextContent('Planificado futuro (resto del mes)');
    expect(screen.getByTestId('eff-month-planned')).toHaveTextContent('5 h');
    expect(screen.getByTestId('eff-month-effective')).not.toHaveTextContent('12 h');
  });

  it('uses realized hours for a past month without a redundant planned card', () => {
    renderModal({
      today: '2026-10-19', year: 2026, month: 8, monthLabel: 'Septiembre 2026',
      localMonthShifts: [shift('past-sep', '2026-09-04', 'Regular', '08:00', '16:00')],
    });
    expect(screen.getByText('Horas efectivas del mes')).toBeInTheDocument();
    expect(screen.getByTestId('eff-month-effective')).toHaveTextContent('8 h');
    expect(screen.queryByText('Horas planificadas')).toBeNull();
    expect(screen.queryByTestId('eff-month-planned')).toBeNull();
  });

  it('updates the presentation when the selected month changes without closing the modal', () => {
    const rows = [
      shift('past', '2026-09-04', 'Regular', '08:00', '16:00'),
      shift('current-realized', '2026-10-05', 'Regular', '08:00', '15:00'),
      shift('current-planned', '2026-10-22', 'Regular', '08:00', '13:00'),
      shift('future', '2026-11-04', 'Regular', '08:00', '14:00'),
    ];
    const view = renderModal({ today: '2026-10-19', month: 9, monthLabel: 'Octubre 2026', localMonthShifts: rows });
    expect(screen.getByText('Horas efectivas hasta hoy')).toBeInTheDocument();

    view.rerender(
      <I18nProvider><StatisticsModal isOpen onClose={vi.fn()} employeeId={null} year={2026} month={10} monthLabel="Noviembre 2026" today="2026-10-19" target={null} canConfigureTarget showContract localMonthShifts={rows} localYearShifts={rows} /></I18nProvider>,
    );
    expect(screen.getByText('Horas planificadas')).toBeInTheDocument();

    view.rerender(
      <I18nProvider><StatisticsModal isOpen onClose={vi.fn()} employeeId={null} year={2026} month={8} monthLabel="Septiembre 2026" today="2026-10-19" target={null} canConfigureTarget showContract localMonthShifts={rows} localYearShifts={rows} /></I18nProvider>,
    );
    expect(screen.getByText('Horas efectivas del mes')).toBeInTheDocument();
  });

  it('tabs are buttons with a stable accessible name even when a short label is shown', () => {
    renderModal();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(screen.getByRole('tablist', { name: 'Periodo de las estadísticas' })).toBeInTheDocument();
    for (const tab of tabs) expect(tab.tagName).toBe('BUTTON');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'stats-tab-month');
  });
});
