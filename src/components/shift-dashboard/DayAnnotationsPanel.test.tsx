// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '../../lib/i18n-react';
import type { DayAnnotation } from '../../lib/remote';

const setDcfInterval = vi.fn().mockResolvedValue({ completeness: 'HOURS_KNOWN' });
vi.mock('../../lib/remote', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../lib/remote')>()), setDcfInterval: (input: unknown) => setDcfInterval(input) }));
import { DayAnnotationsPanel } from './DayAnnotationsPanel';

afterEach(cleanup);
beforeEach(() => { window.localStorage?.setItem?.('anclora_shiftimport_locale_v1', 'es'); setDcfInterval.mockClear(); });

const dcf = (over: Partial<DayAnnotation> = {}): DayAnnotation => ({
  id: 'a1', employeeId: 'e1', date: '2026-03-23', kind: 'DCF', text: null, startTime: null, endTime: null,
  completeness: 'HOURS_UNKNOWN', origin: 'IMPORT', sourceKind: 'EMPLOYEE_CALENDAR_EXPORT', ...over,
});
const comment: DayAnnotation = { id: 'c1', employeeId: 'e1', date: '2026-03-23', kind: 'COMMENT', text: 'cambio por operativa', startTime: null, endTime: null, completeness: null, origin: 'IMPORT', sourceKind: null };
const renderPanel = (annotations: DayAnnotation[], canEdit: boolean) => render(
  <I18nProvider><DayAnnotationsPanel employeeId="e1" date="2026-03-23" annotations={annotations} canEdit={canEdit} /></I18nProvider>,
);

describe('DayAnnotationsPanel', () => {
  it('shows an unknown-hours DCF as "Horario no especificado" without inventing an interval', () => {
    renderPanel([dcf()], false);
    expect(screen.getByTestId('day-annotation-dcf-hours')).toHaveTextContent('Horario no especificado');
    expect(screen.queryByTestId('dcf-start')).toBeNull(); // EMPLOYEE (cannot edit) gets no inputs
  });

  it('lets a planner complete the interval, validating HH:MM', async () => {
    renderPanel([dcf()], true);
    fireEvent.change(screen.getByTestId('dcf-start'), { target: { value: '8:00' } });
    fireEvent.change(screen.getByTestId('dcf-end'), { target: { value: '12:00' } });
    fireEvent.click(screen.getByTestId('dcf-save'));
    expect(setDcfInterval).not.toHaveBeenCalled(); // invalid start
    fireEvent.change(screen.getByTestId('dcf-start'), { target: { value: '08:00' } });
    fireEvent.click(screen.getByTestId('dcf-save'));
    await waitFor(() => expect(setDcfInterval).toHaveBeenCalledWith({ employeeId: 'e1', date: '2026-03-23', startTime: '08:00', endTime: '12:00' }));
  });

  it('shows a known interval and labels imported observations as imported', () => {
    renderPanel([dcf({ completeness: 'HOURS_KNOWN', startTime: '08:00', endTime: '12:00' }), comment], false);
    expect(screen.getByTestId('day-annotation-dcf-hours')).toHaveTextContent('08:00');
    expect(screen.getByTestId('day-annotations')).toHaveTextContent('cambio por operativa');
  });

  it('renders nothing for a day without annotations', () => {
    const { container } = renderPanel([], true);
    expect(container).toBeEmptyDOMElement();
  });
});
