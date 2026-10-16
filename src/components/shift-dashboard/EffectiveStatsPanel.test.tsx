// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';
import type { Shift } from '../../lib/types';
import { EffectiveStatsPanel } from './EffectiveStatsPanel';

afterEach(cleanup);

const shift = (id: string, date: string, shiftType: string, startTime = '', endTime = '', extra: Partial<Shift> = {}): Shift => ({
  id, date, startTime, endTime, shiftType, location: shiftType, origin: 'IMP', ...extra,
});

const feb = [
  shift('a', '2026-02-06', 'Regular', '13:00', '20:00'),
  shift('b', '2026-02-06', 'Extras', '20:00', '21:00'),
  shift('c', '2026-02-06', 'JT', '13:00', '21:00'),
  shift('d', '2026-02-18', 'Regular', '13:00', '21:00'),
  shift('e', '2026-02-18', 'Extras', '21:00', '23:15'),
  shift('f', '2026-02-18', 'JT', '13:00', '23:15'),
  shift('g', '2026-02-10', 'Libre'),
];

function renderPanel(overrides: Partial<React.ComponentProps<typeof EffectiveStatsPanel>> = {}) {
  return render(
    <I18nProvider>
      <EffectiveStatsPanel
        monthShifts={feb}
        yearShifts={feb}
        year={2026}
        monthLabel="Febrero 2026"
        monthRange={{ from: '2026-02-01', to: '2026-02-28' }}
        today="2026-10-16"
        target={null}
        canConfigureTarget
        showContract
        onConfigureTarget={() => undefined}
        {...overrides}
      />
    </I18nProvider>,
  );
}

describe('EffectiveStatsPanel', () => {
  it('computes month and year from the effective calendar (JT adds no hours)', () => {
    renderPanel();
    // 8h + 10h15 = 18h15; JT summaries (8h and 10h15) are not added.
    expect(screen.getByTestId('eff-month-effective')).toHaveTextContent('18 h 15 min');
    expect(screen.getByTestId('eff-month-regular')).toHaveTextContent('15 h');
    expect(screen.getByTestId('eff-month-extras')).toHaveTextContent('3 h 15 min');
    expect(screen.getByTestId('eff-year-effective')).toHaveTextContent('18 h 15 min');
    expect(screen.getByTestId('eff-month-free-days')).toHaveTextContent('1 d');
  });

  it('no longer renders the legacy Propios / Empresa accumulators', () => {
    renderPanel();
    const panel = screen.getByTestId('effective-stats-panel');
    expect(within(panel).queryByText(/Propios/)).toBeNull();
    expect(within(panel).queryByText(/^Empresa$/)).toBeNull();
    expect(screen.queryByTestId('stats-bar-desktop')).toBeNull();
  });

  it('shows "Objetivo anual no configurado" and a Configure button for admins', () => {
    renderPanel();
    expect(screen.getByTestId('eff-contract-unconfigured')).toHaveTextContent('Objetivo anual no configurado');
    expect(screen.getByTestId('eff-contract-configure')).toBeInTheDocument();
  });

  it('hides Configure for read-only roles but keeps the statistics', () => {
    renderPanel({ canConfigureTarget: false });
    expect(screen.queryByTestId('eff-contract-configure')).toBeNull();
    expect(screen.getByTestId('eff-month-effective')).toBeInTheDocument();
  });

  it('hides the contract block in local-first mode', () => {
    renderPanel({ showContract: false });
    expect(screen.queryByTestId('eff-contract-card')).toBeNull();
  });

  it('evaluates an annual target with text status (not color only)', () => {
    renderPanel({ target: { minimumAnnualMinutes: 20 * 60, maximumAnnualMinutes: 30 * 60 } });
    const status = screen.getByTestId('eff-contract-status');
    expect(status).toHaveAttribute('data-status', 'BELOW_MINIMUM');
    expect(status).toHaveTextContent('Faltan 1 h 45 min para alcanzar el mínimo');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByTestId('eff-contract-margin')).toHaveTextContent('10 h');
  });

  it('reports days requiring review without adding their hours', () => {
    const rows = [
      shift('p', '2026-06-02', 'Baja'),
      shift('q', '2026-06-02', 'Regular', '14:00', '22:00', { effectiveState: 'REQUIRES_REVIEW' }),
    ];
    renderPanel({
      monthShifts: rows,
      yearShifts: rows,
      monthLabel: 'Junio 2026',
      monthRange: { from: '2026-06-01', to: '2026-06-30' },
    });
    expect(screen.getByTestId('eff-unresolved-alert')).toHaveTextContent('1 día pendiente de reconciliación');
    expect(screen.getByTestId('eff-month-effective')).toHaveTextContent('0 h');
  });

  it('separates planned future hours from realised hours', () => {
    const rows = [
      shift('x', '2026-10-01', 'Regular', '08:00', '16:00'),
      shift('y', '2026-10-20', 'Regular', '08:00', '12:00'),
    ];
    renderPanel({
      monthShifts: rows,
      yearShifts: rows,
      monthLabel: 'Octubre 2026',
      monthRange: { from: '2026-10-01', to: '2026-10-31' },
    });
    expect(screen.getByTestId('eff-month-effective')).toHaveTextContent('8 h');
    expect(screen.getByTestId('eff-month-planned')).toHaveTextContent('4 h');
  });
});
