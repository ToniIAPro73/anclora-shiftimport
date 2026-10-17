// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRequire } from 'node:module';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { detectTeamRoster } from '../../ingestion/team-roster';
import * as remote from '../../lib/remote';
import { RemoteEmployee } from '../../lib/remote';
import { TeamImportModal } from './TeamImportModal';

// Node has no DOM Worker: point PDF.js at the legacy worker module resolved
// from disk, same setup as src/ingestion/parsers/pdf.integration.test.ts.
const require = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');

vi.mock('../../ingestion/team-roster', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ingestion/team-roster')>();
  return { ...actual, detectTeamRoster: vi.fn() };
});

vi.mock('../../lib/remote', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/remote')>();
  return {
    ...actual,
    matchRemoteEmployee: vi.fn(),
    createRemoteEmployee: vi.fn(),
    updateRemoteEmployee: vi.fn(),
    bulkCreateRemoteEmployees: vi.fn(),
    confirmRemoteFutureImport: vi.fn(),
    createRemoteImport: vi.fn(),
    syncRemoteShifts: vi.fn(),
    loadRemoteShifts: vi.fn(),
  };
});

setupLocalStorageMock();
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

const mockedDetectTeamRoster = vi.mocked(detectTeamRoster);
const mockedMatchRemoteEmployee = vi.mocked(remote.matchRemoteEmployee);
const mockedLoadRemoteShifts = vi.mocked(remote.loadRemoteShifts);

const csvFile = () => new File(['name,date,start,end\nAna,2026-03-04,08:00,16:00'], 'equipo.csv', { type: 'text/csv' });
const remoteEmployee = (over: Partial<RemoteEmployee>): RemoteEmployee => ({ id: 'emp-x', organizationId: 'org-1', externalEmployeeId: null, name: 'X', userId: null, status: 'active', ...over });
const shift = (date: string) => ({ date, startTime: '08:00', endTime: '16:00', origin: 'IMP' as const, isValid: true, confidence: 1, rawText: '08:00-16:00', shiftType: 'Regular', notes: null, color: null });
const PEOPLE = [
  { id: 'emp-1', name: 'Ana Uno', ext: '111' },
  { id: 'emp-2', name: 'Beto Dos', ext: '222' },
  { id: 'emp-3', name: 'Carla Tres', ext: '333' },
];

async function openSelectStep() {
  mockedDetectTeamRoster.mockReturnValue({
    employees: PEOPLE.map((p) => ({ key: p.ext, externalEmployeeId: p.ext, name: p.name, shifts: [shift('2026-03-04'), shift('2026-03-05')] })),
  });
  mockedMatchRemoteEmployee.mockImplementation(async ({ externalId }) => {
    const person = PEOPLE.find((p) => p.ext === externalId)!;
    return { kind: 'recognized', employees: [remoteEmployee({ id: person.id, name: person.name, externalEmployeeId: person.ext })] };
  });
  mockedLoadRemoteShifts.mockResolvedValue([]);
  render(<I18nProvider><TeamImportModal isOpen onClose={() => {}} onImported={() => {}} sessionRole="ADMIN" currentPlan={null} areas={[]} currentAreaId={null} allowAreaChoice={false} /></I18nProvider>);
  fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [csvFile()] } });
  await waitFor(() => expect(screen.getByTestId('team-import-scope')).toBeTruthy());
  return screen.getByTestId('team-import-scope') as HTMLSelectElement;
}

describe('TeamImportModal — the DOCUMENT defines the import scope (employees contained in the file)', () => {
  it('D: a multi-employee document defaults to "Todos los empleados" with every resolved employee in scope', async () => {
    const scope = await openSelectStep();
    expect(scope.value).toBe('ALL');
    expect(screen.getByRole('option', { name: 'Todos los empleados (3)' })).toBeTruthy();
    expect(screen.getByText('3 seleccionados de 3')).toBeTruthy();
  });

  it('E/F: choosing one employee limits the scope (and the payload) to that employee; All -> One -> All recalculates without stale state', async () => {
    const scope = await openSelectStep();
    fireEvent.change(scope, { target: { value: '222' } });
    expect(screen.getByText('1 seleccionados de 3')).toBeTruthy();
    expect((screen.getByLabelText('Beto Dos') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Ana Uno') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Carla Tres') as HTMLInputElement).checked).toBe(false);

    fireEvent.change(scope, { target: { value: 'ALL' } });
    expect(screen.getByText('3 seleccionados de 3')).toBeTruthy();
    fireEvent.change(scope, { target: { value: '222' } });
    expect(screen.getByText('1 seleccionados de 3')).toBeTruthy();

    // the preview (diff against the calendar) is built ONLY for the chosen employee
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByText('Resumen antes de importar')).toBeTruthy());
    expect(mockedLoadRemoteShifts.mock.calls.map((call) => call[0])).toEqual(['emp-2']);
  });

  it('with "Todos los empleados" the preview covers all three employees', async () => {
    await openSelectStep();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByText('Resumen antes de importar')).toBeTruthy());
    expect(mockedLoadRemoteShifts.mock.calls.map((call) => call[0]).sort()).toEqual(['emp-1', 'emp-2', 'emp-3']);
  });
});
