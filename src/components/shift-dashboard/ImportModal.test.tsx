// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { loadFormatProfiles, saveFormatProfile, UserFormatProfile } from '../../lib/format-profiles';
import { getTtfvEvents } from '../../lib/ttfv';
import { ParsedCalendarShift } from '../../lib/import-types';
import { analyzeDocumentFile, DocumentAnalysisResult } from '../../ingestion/parsers/file';
import { analyzeItemsForImport, ItemAnalysis } from '../../ingestion/analysis';
import { ImportModal } from './ImportModal';

vi.mock('../../ingestion/parsers/file', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ingestion/parsers/file')>();
  return { ...actual, analyzeDocumentFile: vi.fn() };
});

vi.mock('../../ingestion/analysis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ingestion/analysis')>();
  return { ...actual, analyzeItemsForImport: vi.fn() };
});

setupLocalStorageMock();
afterEach(cleanup);

const mockedAnalyzeDocumentFile = vi.mocked(analyzeDocumentFile);
const mockedAnalyzeItemsForImport = vi.mocked(analyzeItemsForImport);

const INITIAL_CONTEXT = { month: 0, year: 2026 };
const DOCUMENT_CONTEXT = { month: 2, year: 2026 };

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

function makeProfile(overrides: Partial<UserFormatProfile> = {}): UserFormatProfile {
  return {
    profileVersion: 1,
    id: 'profile-1',
    label: 'Cuadrante mensual',
    signature: { documentType: 'TYPE_A', structureHash: 'deadbeef', dayHeaderCount: 31, columnCount: 31, hasLegend: false },
    tokenAliases: {},
    offTokens: [],
    employeeRow: { strategy: 'name' },
    parserParams: { clusterTolerance: 8, columnMatchMaxDistance: 12 },
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    useCount: 0,
    ...overrides,
  };
}

function makeResult(overrides: Partial<DocumentAnalysisResult> = {}): DocumentAnalysisResult {
  const shifts = [makeShift(), makeShift({ date: '2026-03-05' })];
  return {
    kind: 'csv',
    context: DOCUMENT_CONTEXT,
    shifts,
    quality: { shifts, confidence: 1, warnings: [], state: 'CORRECT' },
    structure: null,
    questions: [],
    ...overrides,
  };
}

const CANDIDATE = { label: 'Ana Martinez (1001)', page: 1, y: 200, rowIndex: 1 };

function makeItemAnalysis(overrides: Partial<ItemAnalysis> = {}): ItemAnalysis {
  return {
    structure: {
      documentType: 'TYPE_A',
      signature: makeProfile().signature,
      dayHeaderCount: 31,
      matchedProfile: null,
      drift: null,
      periodDetected: true,
    },
    employeeMatch: 'none',
    rowItems: null,
    unknownTokens: [],
    totalTokens: 0,
    recognizedTokens: 0,
    invalidTimes: 0,
    ...overrides,
  };
}

function renderImportModal(
  locale: 'es' | 'en',
  onClose: () => void,
  options: { onConfirmImport?: (shifts: unknown, period: unknown) => Promise<boolean>; initialFile?: File | null } = {},
) {
  if (locale === 'en') {
    localStorage.setItem('anclora_shiftimport_locale_v1', 'en');
  }
  return render(
    <I18nProvider>
      <ImportModal
        isOpen
        onClose={onClose}
        onConfirmImport={options.onConfirmImport ?? (async () => true)}
        initialContext={INITIAL_CONTEXT}
        initialFile={options.initialFile ?? null}
      />
    </I18nProvider>,
  );
}

const csvFile = () => new File(['fecha,tipo\n2026-03-04,Regular'], 'cuadrante.csv', { type: 'text/csv' });

describe('ImportModal', () => {
  it('shows the Spanish, format-neutral empty-state copy ("Procesar archivo", not "Procesar PDF")', () => {
    renderImportModal('es', () => {});
    expect(screen.getByText('Pulsa "Procesar archivo" para detectar turnos')).toBeTruthy();
    expect(screen.getByText('Procesar archivo')).toBeTruthy();
    expect(screen.queryByText(/Procesar PDF/)).toBeNull();
  });

  it('shows the English empty-state copy when locale is en', () => {
    renderImportModal('en', () => {});
    expect(screen.getByText('Click "Process file" to detect shifts')).toBeTruthy();
    expect(screen.getByText('Process file')).toBeTruthy();
  });

  it('closes via the external close button (positioned outside the header row, absolute in the card)', () => {
    const onClose = vi.fn();
    renderImportModal('es', onClose);
    const closeButton = screen.getByLabelText('Cerrar importación');
    expect(closeButton.style.position).toBe('absolute');
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    renderImportModal('es', onClose);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ImportModal (analysis-driven, Phase 1A)', () => {
  it('known-profile fast path: CORRECT chip + profile chip, no assistant, touch on confirm', async () => {
    const profile = saveFormatProfile(makeProfile());
    const signature = { ...profile.signature };
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult({
      quality: { shifts: makeResult().shifts, confidence: 1, warnings: [], state: 'CORRECT', profileId: profile.id },
      structure: {
        documentType: 'TYPE_A',
        signature,
        dayHeaderCount: 31,
        matchedProfile: { profile, score: 1 },
        drift: { drifted: false, changedFields: [] },
        periodDetected: true,
      },
    }));
    const onConfirmImport = vi.fn(async () => true);

    renderImportModal('es', () => {}, { onConfirmImport, initialFile: csvFile() });

    await waitFor(() => expect(screen.getByTestId('import-quality-state').textContent).toBe('Listo'));
    expect(screen.getByText('Formato reconocido: Cuadrante mensual')).toBeTruthy();
    expect(screen.queryByText('Asistente de formato')).toBeNull();
    expect(mockedAnalyzeItemsForImport).not.toHaveBeenCalled();
    // TTFV: the preview with shifts was reached.
    expect(getTtfvEvents().some((event) => event.name === 'preview_ready')).toBe(true);

    fireEvent.click(screen.getByText('Confirmar Importación (2/2 listos)'));
    await waitFor(() => expect(onConfirmImport).toHaveBeenCalledTimes(1));
    expect(loadFormatProfiles()[0].useCount).toBe(1);
  });

  it('unknown format with unmatchable employee: no fabricated shifts, assistant renders, confirm disabled', async () => {
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult({
      shifts: [],
      quality: {
        shifts: [],
        confidence: 0.2,
        warnings: [{ code: 'EMPLOYEE_MATCH_WEAK' }],
        state: 'UNRECOGNIZED',
      },
      structure: makeItemAnalysis().structure,
      questions: [{ kind: 'row-selection', candidates: [CANDIDATE] }],
    }));
    mockedAnalyzeItemsForImport.mockReturnValue(makeItemAnalysis());

    renderImportModal('es', () => {}, { initialFile: csvFile() });

    await waitFor(() => expect(screen.getByText('Asistente de formato')).toBeTruthy());
    expect(screen.getByTestId('import-quality-state').textContent).toBe('Necesita tu respuesta');
    expect(screen.getByText('¿Cuál de estas filas eres tú?')).toBeTruthy();
    expect(screen.getByText('Ana Martinez (1001)')).toBeTruthy();

    const confirmButton = screen.getByRole('button', { name: /Confirmar Importación/ }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    // Cancelling the assistant leaves an explicit BLOCKED state: the
    // no-shifts explanation replaces the neutral hint and confirm stays off.
    fireEvent.click(screen.getByText('Cancelar'));
    await waitFor(() => expect(screen.queryByText('Asistente de formato')).toBeNull());
    expect(screen.getByTestId('import-quality-state').textContent).toBe('Bloqueado');
    expect(screen.getByText('No hemos encontrado turnos importables.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Confirmar Importación/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('unknown shift code is surfaced, never silently dropped (GS-10)', async () => {
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult({
      quality: {
        shifts: makeResult().shifts,
        confidence: 0.7,
        warnings: [
          { code: 'UNKNOWN_SHIFT_TOKEN', context: { token: 'DL' } },
          { code: 'EMPLOYEE_MATCH_WEAK' },
        ],
        state: 'REVIEW',
      },
    }));

    renderImportModal('es', () => {}, { initialFile: csvFile() });

    // No assistant questions mocked → the exclusion is explicit, not silent.
    await waitFor(() => expect(screen.getByTestId('import-quality-state').textContent).toBe('Listo'));
    expect(screen.getByText(/Códigos sin definir: DL/)).toBeTruthy();
    expect(screen.getByText(/La coincidencia con tu nombre es débil/)).toBeTruthy();
  });

  it('keeps the editable preview working: edit a date, delete a row, diff chips update', async () => {
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult());

    renderImportModal('es', () => {}, { initialFile: csvFile() });

    await waitFor(() => expect(screen.getByText('2 nuevos')).toBeTruthy());

    // Edit the first row's date.
    const dateInput = screen.getByDisplayValue('2026-03-04');
    fireEvent.change(dateInput, { target: { value: '2026-03-06' } });
    expect(screen.getByDisplayValue('2026-03-06')).toBeTruthy();

    // Delete the second row.
    const rows = document.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    fireEvent.click(within(rows[1] as HTMLElement).getByRole('button'));

    await waitFor(() => expect(screen.getByText('1 nuevos')).toBeTruthy());
    expect(document.querySelectorAll('tbody tr')).toHaveLength(1);
  });
});
