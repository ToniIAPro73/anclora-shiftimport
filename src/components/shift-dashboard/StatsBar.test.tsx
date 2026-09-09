// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';
import { Shift } from '../../lib/types';
import { StatsBar } from './StatsBar';

afterEach(cleanup);

const mockMonthShifts: Shift[] = [
  {
    id: 's-1',
    date: '2026-09-01',
    startTime: '08:00',
    endTime: '16:00',
    location: 'Regular',
    origin: 'MAN',
  },
  {
    id: 's-2',
    date: '2026-09-02',
    startTime: '08:00',
    endTime: '16:00',
    location: 'Regular',
    origin: 'MAN',
  },
  {
    id: 's-3',
    date: '2026-09-03',
    startTime: '09:00',
    endTime: '17:00',
    location: 'Regular',
    origin: 'IMP',
  },
];

const mockYearShifts: Shift[] = [
  ...mockMonthShifts,
  {
    id: 's-4',
    date: '2026-08-01',
    startTime: '08:00',
    endTime: '16:00',
    location: 'Regular',
    origin: 'MAN',
  },
];

describe('StatsBar responsive metrics layout (UXR-F3-M01 / CX-F02)', () => {
  it('renders both desktop ribbon and mobile responsive layout', () => {
    render(
      <I18nProvider>
        <StatsBar
          currentMonthShifts={mockMonthShifts}
          daysInMonth={30}
          currentYearShifts={mockYearShifts}
          daysInYear={365}
        />
      </I18nProvider>,
    );

    // Desktop ribbon exists and is tab-accessible
    const desktopRibbon = screen.getByTestId('stats-bar-desktop');
    expect(desktopRibbon).toBeInTheDocument();
    expect(desktopRibbon).toHaveAttribute('tabIndex', '0');

    // Mobile container exists with dedicated cards for Own and Company
    const mobileContainer = screen.getByTestId('stats-bar-mobile');
    expect(mobileContainer).toBeInTheDocument();

    const ownMobileCard = screen.getByTestId('stats-mobile-card-propios');
    expect(ownMobileCard).toBeInTheDocument();

    const companyMobileCard = screen.getByTestId('stats-mobile-card-empresa');
    expect(companyMobileCard).toBeInTheDocument();
  });

  it('displays primary month and year total metrics clearly in the mobile card header', () => {
    render(
      <I18nProvider>
        <StatsBar
          currentMonthShifts={mockMonthShifts}
          daysInMonth={30}
          currentYearShifts={mockYearShifts}
          daysInYear={365}
        />
      </I18nProvider>,
    );

    const ownCard = screen.getByTestId('stats-mobile-card-propios');
    // Own month has 2 shifts of 8 hours = 16.0h / 2d
    expect(ownCard).toHaveTextContent('16.0h / 2d');
    // Own year has 3 shifts of 8 hours = 24.0h / 3d
    expect(ownCard).toHaveTextContent('24.0h / 3d');

    const companyCard = screen.getByTestId('stats-mobile-card-empresa');
    // Company month has 1 shift of 8 hours = 8.0h / 1d
    expect(companyCard).toHaveTextContent('8.0h / 1d');
  });

  it('provides a keyboard-accessible scroll region with hint for the shift types breakdown on mobile', () => {
    render(
      <I18nProvider>
        <StatsBar
          currentMonthShifts={mockMonthShifts}
          daysInMonth={30}
          currentYearShifts={mockYearShifts}
          daysInYear={365}
        />
      </I18nProvider>,
    );

    const ownRegion = screen.getByRole('region', { name: /Desglose de turnos de Propios/i });
    expect(ownRegion).toBeInTheDocument();
    expect(ownRegion).toHaveAttribute('tabIndex', '0');

    // Scroll hint is present in the DOM for mobile users
    expect(screen.getAllByText(/Desliza para ver desglose por tipo/i).length).toBeGreaterThan(0);
  });
});
