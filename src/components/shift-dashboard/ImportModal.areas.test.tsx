// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { ParsedCalendarShift } from '../../lib/import-types';
import { analyzeDocumentFile, DocumentAnalysisResult } from '../../ingestion/parsers/file';
import { RemoteArea } from '../../lib/remote';
import { ImportModal } from './ImportModal';

vi.mock('../../ingestion/parsers/file', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ingestion/parsers/file')>();
  return { ...actual, analyzeDocumentFile: vi.fn() };
});

setupLocalStorageMock();
afterEach(cleanup);

const mockedAnalyzeDocumentFile = vi.mocked(analyzeDocumentFile);

const area = (over: Partial<RemoteArea> = {}): RemoteArea => ({
  id: 'area-n',
  name: 'Norte',
  code: 'N',
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const AREAS = [area(), area({ id: 'area-s', name: 'Sur', code: null })];

function makeShift(overrides: Partial<ParsedCalendarShift> = {}): ParsedCalendarShift {
  return {
    date: '2026-03-04',
    startTime: '08:00',
    endTime: '16:00',
    origin: 'IMP',
    isValid: true,
    confidence: 1,
    rawText: '08:00-16:00',
    shiftType: 'Regular',
    notes: null,
    color: null,
    sourceFormat: 'csv',
    ...overrides,
  };
}

function makeResult(): DocumentAnalysisResult {
  const shifts = [makeShift(), makeShift({ date: '2026-03-05' })];
  return {
    kind: 'csv',
    context: { month: 2, year: 2026 },
    shifts,
    quality: { shifts, confidence: 1, warnings: [], state: 'CORRECT' },
    structure: null,
    questions: [],
  };
}

const csvFile = () => new File(['fecha,tipo\n2026-03-04,Regular'], 'cuadrante.csv', { type: 'text/csv' });

function renderImportModal(options: {
  areas?: RemoteArea[];
  currentAreaId?: string | null;
  allowAreaChoice?: boolean;
  initialFile?: File | null;
  onConfirmImport?: (...args: unknown[]) => Promise<boolean>;
} = {}) {
  return render(
    <I18nProvider>
      <ImportModal
        isOpen
        onClose={() => {}}
        onConfirmImport={(options.onConfirmImport as never) ?? (async () => true)}
        initialContext={{ month: 0, year: 2026 }}
        initialFile={options.initialFile ?? null}
        areas={options.areas ?? []}
        currentAreaId={options.currentAreaId ?? null}
        allowAreaChoice={options.allowAreaChoice ?? false}
      />
    </I18nProvider>,
  );
}

describe('ImportModal — area context', () => {
  it('0 areas: no area UI at all', () => {
    renderImportModal();
    expect(screen.queryByTestId('import-area-context')).toBeNull();
    expect(screen.queryByText('Área de la importación')).toBeNull();
  });

  it('1 area: the area name is shown as fixed context, never a dropdown', () => {
    renderImportModal({ areas: [area()] });
    const context = screen.getByTestId('import-area-context');
    expect(context.textContent).toContain('Norte');
    expect(screen.queryByText('Área de la importación')).toBeNull();
  });

  it('2+ areas + allowAreaChoice (ADMIN): selector defaults to "Toda la empresa" and lists every area', () => {
    renderImportModal({ areas: AREAS, allowAreaChoice: true });
    expect(screen.getByText('Área de la importación')).toBeTruthy();

    fireEvent.click(screen.getByText('Toda la empresa'));
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toContain('Toda la empresa');
    expect(options).toContain('Norte');
    expect(options).toContain('Sur');
  });

  it('2+ areas without choice (EMPLOYEE): own area shown as read-only context, no selector', () => {
    renderImportModal({ areas: AREAS, currentAreaId: 'area-n' });
    const context = screen.getByTestId('import-area-context');
    expect(context.textContent).toContain('Norte');
    expect(screen.queryByText('Área de la importación')).toBeNull();
  });

  it('the chosen area is passed to onConfirmImport as the import areaId', async () => {
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult());
    const onConfirmImport = vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true);
    renderImportModal({ areas: AREAS, allowAreaChoice: true, initialFile: csvFile(), onConfirmImport });

    await waitFor(() => expect(screen.getByText('Confirmar Importación (2/2 listos)')).toBeTruthy());

    fireEvent.click(screen.getByText('Toda la empresa'));
    fireEvent.click(screen.getByRole('option', { name: 'Sur' }));

    fireEvent.click(screen.getByText('Confirmar Importación (2/2 listos)'));
    await waitFor(() => expect(onConfirmImport).toHaveBeenCalledTimes(1));
    expect(onConfirmImport.mock.calls[0][3]).toBe('area-s');
  });

  it('without a choice the import keeps the inherited dashboard area context', async () => {
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult());
    const onConfirmImport = vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true);
    renderImportModal({ areas: AREAS, allowAreaChoice: true, currentAreaId: 'area-n', initialFile: csvFile(), onConfirmImport });

    await waitFor(() => expect(screen.getByText('Confirmar Importación (2/2 listos)')).toBeTruthy());
    fireEvent.click(screen.getByText('Confirmar Importación (2/2 listos)'));

    await waitFor(() => expect(onConfirmImport).toHaveBeenCalledTimes(1));
    expect(onConfirmImport.mock.calls[0][3]).toBe('area-n');
  });
});
