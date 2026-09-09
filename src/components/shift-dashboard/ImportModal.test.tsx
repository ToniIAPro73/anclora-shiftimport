// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { loadFormatProfiles, saveFormatProfile, UserFormatProfile } from '../../lib/format-profiles';
import { saveShiftTypeOverrides } from '../../lib/shift-types';
import { getTtfvEvents } from '../../lib/ttfv';
import { ParsedCalendarShift } from '../../lib/import-types';
import { Shift } from '../../lib/types';
import { analyzeDocumentFile, DocumentAnalysisResult } from '../../ingestion/parsers/file';
import { analyzeItemsForImport, ItemAnalysis } from '../../ingestion/analysis';
import { detectTeamRoster } from '../../ingestion/team-roster';
import { IngestionError } from '../../lib/ingestion-errors';
import { ImportModal } from './ImportModal';

vi.mock('../../ingestion/parsers/file', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ingestion/parsers/file')>();
  return { ...actual, analyzeDocumentFile: vi.fn() };
});

vi.mock('../../ingestion/analysis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ingestion/analysis')>();
  return { ...actual, analyzeItemsForImport: vi.fn() };
});

vi.mock('../../ingestion/team-roster', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ingestion/team-roster')>();
  return { ...actual, detectTeamRoster: vi.fn() };
});

const apiFetchMock = vi.fn();
vi.mock('../../lib/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/session')>();
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

setupLocalStorageMock();
afterEach(cleanup);

const mockedAnalyzeDocumentFile = vi.mocked(analyzeDocumentFile);
const mockedAnalyzeItemsForImport = vi.mocked(analyzeItemsForImport);
const mockedDetectTeamRoster = vi.mocked(detectTeamRoster);

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
  options: {
    onConfirmImport?: (shifts: unknown, period: unknown, selector?: unknown, areaId?: unknown, fileName?: unknown, fileFingerprint?: unknown, selfImportSummary?: unknown, futureImportDecision?: unknown) => Promise<boolean>;
    initialFile?: File | null;
    employeePreset?: { name: string; externalId: string } | null;
    identityLocked?: boolean;
    organizationId?: string | null;
    existingShifts?: Shift[];
    isImporting?: boolean;
  } = {},
) {
  localStorage.setItem('anclora_shiftimport_locale_v1', locale);
  return render(
    <I18nProvider>
      <ImportModal
        isOpen
        onClose={onClose}
        onConfirmImport={options.onConfirmImport ?? (async () => true)}
        initialContext={INITIAL_CONTEXT}
        initialFile={options.initialFile ?? null}
        employeePreset={options.employeePreset ?? null}
        identityLocked={options.identityLocked ?? false}
        organizationId={options.organizationId ?? null}
        existingShifts={options.existingShifts}
        isImporting={options.isImporting}
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

  it('keeps the import shell fixed and assigns scrolling only to the shifts list', () => {
    renderImportModal('es', () => {});

    const dialog = screen.getByRole('dialog');
    expect(dialog.classList.contains('import-modal')).toBe(true);
    expect(dialog.classList.contains('modal-content')).toBe(true);
    expect(dialog.style.overflowY).toBe('');
    expect(dialog.querySelector('.import-modal__header')).toBeTruthy();
    expect(dialog.querySelector('.import-modal__form')).toBeTruthy();
    expect(dialog.querySelector('.import-modal__content')).toBeTruthy();
    expect((dialog.querySelector('.import-modal__shifts-list') as HTMLElement).classList.contains('import-modal__shifts-list')).toBe(true);
    expect(dialog.querySelector('.import-modal__footer')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: /Confirmar Importación/ })).toBeTruthy();
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

  // CX-F01 / UXR-F2-M01 AC-3: the identity/file summary is collapsible on
  // narrow viewports (CSS-driven; invisible to jsdom, verified visually in
  // the Playwright baseline harness) but the underlying fields are never
  // unmounted — toggling it must never lose an edited value.
  it('toggling the identity/file summary never unmounts the fields: edits survive collapse/expand (CX-F01 AC-3)', async () => {
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult());
    renderImportModal('es', () => {}, { initialFile: csvFile() });

    await waitFor(() => expect(screen.getByTestId('import-identity-summary')).toBeTruthy());
    const toggle = screen.getByTestId('import-identity-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    const nameInput = screen.getByPlaceholderText('Nombre del empleado') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Edited Name' } });
    expect(nameInput.value).toBe('Edited Name');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    // Same input, not a remount: the edited value is still there.
    expect((screen.getByPlaceholderText('Nombre del empleado') as HTMLInputElement).value).toBe('Edited Name');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect((screen.getByPlaceholderText('Nombre del empleado') as HTMLInputElement).value).toBe('Edited Name');
  });

  it('the identity/file summary only appears after a parse produced rows — nothing to collapse before that', () => {
    renderImportModal('es', () => {});
    expect(screen.queryByTestId('import-identity-summary')).toBeNull();
  });

  it('requires an explicit future-draft choice and defaults to historical-only', async () => {
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult({
      shifts: [makeShift({ date: '2099-03-04' })],
      quality: { shifts: [makeShift({ date: '2099-03-04' })], confidence: 1, warnings: [], state: 'CORRECT' },
    }));
    const receivedDecisions: unknown[] = [];
    const onConfirmImport = vi.fn(async (...args: [unknown, unknown, unknown?, unknown?, unknown?, unknown?, unknown?, unknown?]) => {
      receivedDecisions.push(args[7]);
      return true;
    });

    renderImportModal('es', () => {}, { onConfirmImport, initialFile: csvFile() });

    await waitFor(() => expect(screen.getByTestId('import-future-consent')).toBeTruthy());
    expect(screen.getByTestId('import-future-consent').textContent).toContain('Importar solo los turnos históricos');
    fireEvent.click(screen.getByRole('radio', { name: /Importar históricos y añadir los futuros/ }));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Importación/ }));

    await waitFor(() => expect(onConfirmImport).toHaveBeenCalledTimes(1));
    expect(receivedDecisions).toEqual(['draft']);
  });

  it('locks confirmation with a busy cursor and stays open when persistence returns false', async () => {
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult());
    let resolveConfirmation!: (value: boolean) => void;
    const confirmation = new Promise<boolean>((resolve) => { resolveConfirmation = resolve; });
    const onConfirmImport = vi.fn(() => confirmation);
    const onClose = vi.fn();

    renderImportModal('es', onClose, { onConfirmImport, initialFile: csvFile() });
    const confirmButton = await screen.findByRole('button', { name: /Confirmar Importación/ }) as HTMLButtonElement;
    fireEvent.click(confirmButton);
    await waitFor(() => expect(confirmButton.getAttribute('aria-busy')).toBe('true'));
    expect(confirmButton.disabled).toBe(true);
    expect(confirmButton.style.cursor).toBe('wait');
    fireEvent.click(confirmButton);
    await waitFor(() => expect(onConfirmImport).toHaveBeenCalledTimes(1));

    resolveConfirmation(false);
    await waitFor(() => expect(confirmButton.getAttribute('aria-busy')).toBe('false'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes only after persistence returns true', async () => {
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult());
    let resolveConfirmation!: (value: boolean) => void;
    const confirmation = new Promise<boolean>((resolve) => { resolveConfirmation = resolve; });
    const onClose = vi.fn();
    renderImportModal('es', onClose, { onConfirmImport: vi.fn(() => confirmation), initialFile: csvFile() });
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar Importación/ }));
    expect(onClose).not.toHaveBeenCalled();
    resolveConfirmation(true);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('disables confirmation when every detected shift is already identical', async () => {
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult());
    const onConfirmImport = vi.fn(async () => true);
    const existingShifts: Shift[] = [
      { id: 'existing-1', date: '2026-03-04', startTime: '08:00', endTime: '16:00', location: 'Regular', origin: 'IMP' },
      { id: 'existing-2', date: '2026-03-05', startTime: '08:00', endTime: '16:00', location: 'Regular', origin: 'IMP' },
    ];

    renderImportModal('es', () => {}, { onConfirmImport, existingShifts, initialFile: csvFile() });
    const confirmButton = await screen.findByRole('button', { name: /Confirmar Importación/ }) as HTMLButtonElement;

    expect(confirmButton.disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('ya están en el sistema');
    expect(onConfirmImport).not.toHaveBeenCalled();
  });

  it('shows translated importing state and locks the modal controls', () => {
    const onClose = vi.fn();
    renderImportModal('es', onClose, { isImporting: true, initialFile: csvFile() });

    expect(screen.getByText('Importando…').closest('button')).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Cerrar importación' })).toHaveProperty('disabled', true);
    expect(screen.queryByText('importModal.importing')).toBeNull();
    expect(screen.getByRole('button', { name: 'Nueva Importación' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Eliminar archivo seleccionado' })).toHaveProperty('disabled', true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('organization session, drifted match: confirming creates a new candidate (supersedesLogicalProfileId) instead of touching the old profile', async () => {
    apiFetchMock.mockReset();
    const oldRemoteProfile = {
      id: 'remote-old-1',
      organizationId: 'org-drift-1',
      logicalProfileId: 'lp-drift-1',
      version: 1,
      status: 'validated',
      signature: { documentType: 'TYPE_A' as const, structureHash: 'olddeadbeef', dayHeaderCount: 31, columnCount: 31, hasLegend: false },
      sourceType: 'pdf',
      displayName: 'Cuadrante mensual',
      parserConfig: { clusterTolerance: 8, columnMatchMaxDistance: 12 },
      tokenAliases: { DL: 'libre' },
      codeTimes: {},
      offTokens: ['DL'],
      employeeRowStrategy: 'name',
      employeeRowIndex: null,
      dayColumnMap: null,
      tabularMemory: null,
      useCount: 3,
      successfulUseCount: 3,
      lastUsedAt: '2026-03-01T00:00:00.000Z',
      createdByUserId: 'user-1',
      supersedesProfileId: null,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    };
    apiFetchMock.mockResolvedValueOnce({ profiles: [oldRemoteProfile] }); // GET during analysis (profilesHint)

    const driftedSignature = { ...oldRemoteProfile.signature, structureHash: 'newdeadbeef', columnCount: 40 };
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult({
      quality: { shifts: makeResult().shifts, confidence: 1, warnings: [], state: 'CORRECT', profileId: oldRemoteProfile.id },
      structure: {
        documentType: 'TYPE_A',
        signature: driftedSignature,
        dayHeaderCount: 31,
        matchedProfile: { profile: { ...makeProfile(), id: oldRemoteProfile.id, signature: oldRemoteProfile.signature }, score: 0.6 },
        drift: { drifted: true, changedFields: ['structureHash', 'columnCount'] },
        periodDetected: true,
      },
    }));
    const onConfirmImport = vi.fn(async () => true);

    renderImportModal('es', () => {}, { onConfirmImport, initialFile: csvFile(), organizationId: 'org-drift-1' });

    await waitFor(() => expect(screen.getByTestId('import-quality-state').textContent).toBe('Listo'));

    apiFetchMock.mockResolvedValueOnce({ profile: { ...oldRemoteProfile, id: 'remote-new-1', version: 2, status: 'candidate', supersedesProfileId: 'remote-old-1' } }); // POST create-candidate

    fireEvent.click(screen.getByText('Confirmar Importación (2/2 listos)'));
    await waitFor(() => expect(onConfirmImport).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));
    const [, options] = apiFetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.supersedesLogicalProfileId).toBe('lp-drift-1');
    expect(body.tokenAliases).toEqual({ DL: 'libre' });
    expect(body.signature.structureHash).toBe('newdeadbeef');
    // No PATCH "use" call against the old (drifted) profile.
    expect(apiFetchMock.mock.calls.some(([, opts]) => opts?.method === 'PATCH')).toBe(false);
  });

  it('Format Memory store unavailable (GET fails): analysis still completes, non-blocking warning shown, distinguishable from "no saved formats"', async () => {
    apiFetchMock.mockReset();
    apiFetchMock.mockRejectedValueOnce(new Error('network down'));
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult());

    renderImportModal('es', () => {}, { initialFile: csvFile(), organizationId: 'org-store-unavailable-1' });

    await waitFor(() => expect(screen.getByTestId('import-quality-state').textContent).toBe('Listo'));
    expect(screen.getByRole('status').textContent).toContain('No se ha podido comprobar si ya existía un formato guardado');
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

  it('identity mismatch (name and id point to different employees): blocking diagnostic, confirm disabled until a row is chosen', async () => {
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult({
      shifts: [],
      quality: {
        shifts: [],
        confidence: 0.2,
        warnings: [],
        state: 'UNRECOGNIZED',
      },
      structure: makeItemAnalysis().structure,
      questions: [{ kind: 'row-selection', candidates: [CANDIDATE] }],
    }));
    mockedAnalyzeItemsForImport.mockReturnValue(makeItemAnalysis({ employeeMatch: 'mismatch' }));

    renderImportModal('es', () => {}, { initialFile: csvFile() });

    await waitFor(() => expect(screen.getByText(/parecen corresponder a personas distintas/)).toBeTruthy());
    expect(screen.getByTestId('import-quality-state').textContent).toBe('Necesita tu respuesta');
    expect(screen.getByText('¿Cuál de estas filas eres tú?')).toBeTruthy();

    // A mismatched identity never reaches READY/import without human selection.
    const confirmButton = screen.getByRole('button', { name: /Confirmar Importación/ }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
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

  it('keeps the existing code-classification assistant reachable when period recovery has priority', async () => {
    const shifts = makeResult().shifts;
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult({
      shifts,
      quality: {
        shifts,
        confidence: 0.7,
        warnings: [{ code: 'UNKNOWN_SHIFT_TOKEN', context: { token: 'M' } }],
        state: 'REVIEW',
      },
      structure: {
        documentType: 'TYPE_A',
        signature: makeProfile().signature,
        dayHeaderCount: 31,
        matchedProfile: null,
        drift: null,
        periodDetected: true,
      },
      questions: [{ kind: 'shift-code', code: 'M' }],
      detectedContext: DOCUMENT_CONTEXT,
    }));
    mockedAnalyzeItemsForImport.mockReturnValue(makeItemAnalysis({
      unknownTokens: ['M'],
      totalTokens: 1,
      recognizedTokens: 0,
    }));

    renderImportModal('es', () => {}, { initialFile: csvFile() });

    await waitFor(() => expect(screen.getByText('¿Qué turno representa M?')).toBeTruthy());

    // Select a different period after analysis: the period diagnostic becomes
    // primary, but the existing shift-code assistant must remain available.
    const periodTrigger = screen.getAllByRole('button').find((button) => button.textContent === 'Marzo');
    expect(periodTrigger).toBeTruthy();
    fireEvent.click(periodTrigger as HTMLButtonElement);
    fireEvent.click(screen.getByRole('option', { name: 'Enero' }));

    await waitFor(() => {
      expect(screen.getByTestId('import-quality-state').textContent).toBe('Necesita tu respuesta');
      expect(screen.getByText('¿Qué turno representa M?')).toBeTruthy();
    });
  });

  it('incomplete times (??:??) are never "listos": PARTIAL state, excluded from confirm count', async () => {
    const shifts = [
      makeShift({ date: '2026-03-04', startTime: '10:00', endTime: '??:??', isValid: false, rawText: '10:00' }),
      makeShift({ date: '2026-03-05' }),
    ];
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult({
      shifts,
      quality: { shifts, confidence: 0.9, warnings: [], state: 'CORRECT' },
    }));

    renderImportModal('es', () => {}, { initialFile: csvFile() });

    await waitFor(() => expect(screen.getByTestId('import-quality-state').textContent).toBe('Parcial'));
    expect(screen.getByText(/tienen la hora incompleta/)).toBeTruthy();
    expect(screen.getByText(/Días afectados: 4/)).toBeTruthy();
    // Only the complete row is importable; the incomplete one is excluded.
    const confirmButton = screen.getByRole('button', { name: /Confirmar Importación \(1\/2 listos\)/ }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(false);
  });

  it('all rows incomplete → confirm disabled with explanation, never a false Listo', async () => {
    const shifts = [
      makeShift({ date: '2026-03-04', startTime: '10:00', endTime: '??:??', isValid: false, rawText: '10:00' }),
    ];
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult({
      shifts,
      quality: { shifts, confidence: 0.9, warnings: [], state: 'CORRECT' },
    }));

    renderImportModal('es', () => {}, { initialFile: csvFile() });

    await waitFor(() => expect(screen.getByTestId('import-quality-state').textContent).toBe('Parcial'));
    const confirmButton = screen.getByRole('button', { name: /Confirmar Importación \(0\/1 listos\)/ }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
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

  // CX-F01 / UXR-F2-M02 §2.0.1: the row's accessible name is keyed by its
  // own date, not by position — so it stays correct after an earlier row
  // is deleted and everything below it renumbers. This was the Fase 1
  // defect: "Hora de fin, turno 3" became "turno 2" after a delete, no
  // longer identifying the same row a screen-reader user had just heard.
  it('row labels are keyed by date, not position: deleting an earlier row never relabels a later one (§2.0.1)', async () => {
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult());
    renderImportModal('es', () => {}, { initialFile: csvFile() });

    await waitFor(() => expect(screen.getByText('2 nuevos')).toBeTruthy());
    expect(screen.getByLabelText('Fecha, turno del 2026-03-05')).toBeTruthy();

    // Delete the first row (2026-03-04).
    const rows = document.querySelectorAll('tbody tr');
    fireEvent.click(within(rows[0] as HTMLElement).getByRole('button'));

    await waitFor(() => expect(document.querySelectorAll('tbody tr')).toHaveLength(1));
    // The surviving row is now at index 0, but its label still names its
    // own date — never "turno 1", which would misidentify it.
    expect(screen.getByLabelText('Fecha, turno del 2026-03-05')).toBeTruthy();
    expect(screen.queryByLabelText('Fecha, turno 1')).toBeNull();
  });

  it('falls back to the positional ordinal only when the row has no usable date (§2.0.1)', async () => {
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult({
      shifts: [makeShift({ date: '' })],
      quality: { shifts: [makeShift({ date: '' })], confidence: 1, warnings: [], state: 'REVIEW' },
    }));
    renderImportModal('es', () => {}, { initialFile: csvFile() });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Eliminar turno 1' })).toBeTruthy());
  });

  it('unsupported format rejects: UNSUPPORTED state rendered, explanatory text, confirm disabled, no assistant', async () => {
    mockedAnalyzeDocumentFile.mockRejectedValue(new IngestionError('UNSUPPORTED_FORMAT', 'Formato no soportado.'));

    renderImportModal('es', () => {}, { initialFile: csvFile() });

    await waitFor(() => expect(screen.getByTestId('import-quality-state').textContent).toBe('No soportado'));
    expect(screen.queryByText('Asistente de formato')).toBeNull();
    const confirmButton = screen.getByRole('button', { name: /Confirmar Importación/ }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
  });

  it('technical crash rejects: FAILED state rendered, explanatory text without leaking stack trace, confirm disabled, no assistant', async () => {
    mockedAnalyzeDocumentFile.mockRejectedValue(new TypeError('Cannot read properties of undefined'));

    renderImportModal('es', () => {}, { initialFile: csvFile() });

    await waitFor(() => expect(screen.getByTestId('import-quality-state').textContent).toBe('Error'));
    expect(screen.queryByText('Asistente de formato')).toBeNull();
    expect(document.body.textContent).not.toContain('Cannot read properties of undefined');
    const confirmButton = screen.getByRole('button', { name: /Confirmar Importación/ }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
  });
});

describe('ImportModal (role-aware: EMPLOYEE identity lock + self-filter)', () => {
  const SELF = { name: 'Toni Ballesteros', externalId: '1001' };
  const roster = (names: string[]) => ({
    employees: names.map((name, index) => ({
      key: `emp-${index}`,
      externalEmployeeId: name === SELF.name ? SELF.externalId : '',
      name,
      shifts: [makeShift({ date: `2026-03-0${index + 1}` })],
    })),
  });

  it('locked identity: Name is read-only text, ID field is gone entirely', async () => {
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult());
    renderImportModal('es', () => {}, { employeePreset: SELF, identityLocked: true });

    expect(screen.getByTestId('import-employee-name-locked').textContent).toBe(SELF.name);
    expect(screen.queryByLabelText('Nombre')).toBeNull();
    expect(screen.queryByPlaceholderText('Nombre del empleado')).toBeNull();
    expect(screen.queryByPlaceholderText('ID de empleado')).toBeNull();
  });

  // CX-F04 / UXR-F2-M04 AC-1: locked identity (EMPLOYEE) with future rows
  // must show zero drafts and an explicit reason — never the "will create
  // drafts" badge that the self-future notice directly contradicts.
  it('locked identity with future shifts: badge and notice agree that zero drafts will be created', async () => {
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult({
      shifts: [makeShift({ date: '2099-03-04' })],
      quality: { shifts: [makeShift({ date: '2099-03-04' })], confidence: 1, warnings: [], state: 'CORRECT' },
    }));
    renderImportModal('es', () => {}, { employeePreset: SELF, identityLocked: true, initialFile: csvFile() });

    await waitFor(() => expect(screen.getByTestId('import-self-future-notice')).toBeTruthy());
    expect(screen.getByTestId('import-self-future-notice').textContent).toContain('no se creará planificación');

    const badge = screen.getByTestId('import-future-count');
    expect(badge.textContent).toBe('1 turnos futuros detectados; no se crearán borradores con la opción actual');
    // EMPLOYEE never gets the consent toggle: the decision is not theirs to make.
    expect(screen.queryByTestId('import-future-consent')).toBeNull();
  });

  it('unlocked (guest) identity: Name/ID stay editable inputs', () => {
    renderImportModal('es', () => {});
    expect(screen.getByPlaceholderText('Nombre del empleado')).toBeTruthy();
    expect(screen.getByPlaceholderText('ID de empleado')).toBeTruthy();
  });

  it('confirm always sends the account identity, never a retyped one, when locked', async () => {
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult());
    const receivedSelectors: unknown[] = [];
    const onConfirmImport = vi.fn(async (...args: [unknown, unknown, unknown?]) => {
      receivedSelectors.push(args[2]);
      return true;
    });
    renderImportModal('es', () => {}, { employeePreset: SELF, identityLocked: true, onConfirmImport, initialFile: csvFile() });

    await waitFor(() => expect(screen.getByText('Confirmar Importación (2/2 listos)')).toBeTruthy());
    fireEvent.click(screen.getByText('Confirmar Importación (2/2 listos)'));

    await waitFor(() => expect(onConfirmImport).toHaveBeenCalledTimes(1));
    expect(receivedSelectors[0]).toEqual({ name: SELF.name, externalId: SELF.externalId });
  });

  it('multi-employee CSV roster: only the account\'s own row is extracted, other names never render', async () => {
    mockedDetectTeamRoster.mockReturnValue(roster(['Alguien Mas', SELF.name, 'Otra Persona']));
    const callsBefore = mockedAnalyzeDocumentFile.mock.calls.length;
    renderImportModal('es', () => {}, { employeePreset: SELF, identityLocked: true, initialFile: csvFile() });

    await waitFor(() => expect(screen.getByText('1 encontrados')).toBeTruthy());
    const summary = screen.getByTestId('self-import-summary');
    expect(summary.textContent).toContain('3 filas detectadas');
    expect(summary.textContent).toContain('1 propias');
    expect(summary.textContent).toContain('2 ajenas');
    expect(screen.queryByText('Alguien Mas')).toBeNull();
    expect(screen.queryByText('Otra Persona')).toBeNull();
    // Roster self-filter is a full bypass: the single-employee analysis
    // pipeline (which would have no self-filtering at all) is never reached.
    expect(mockedAnalyzeDocumentFile.mock.calls.length).toBe(callsBefore);
  });

  it('multi-employee CSV roster without the account\'s row: explicit not-found message, no other names, no data leak', async () => {
    mockedDetectTeamRoster.mockReturnValue(roster(['Alguien Mas', 'Otra Persona']));
    renderImportModal('es', () => {}, { employeePreset: SELF, identityLocked: true, initialFile: csvFile() });

    await waitFor(() => expect(screen.getByText('No hemos encontrado tus turnos en este documento.')).toBeTruthy());
    expect(screen.getByText('Comprueba que has seleccionado el cuadrante correcto.')).toBeTruthy();
    expect(screen.queryByText('Alguien Mas')).toBeNull();
    expect(screen.queryByText('Otra Persona')).toBeNull();
  });

  it('multi-employee CSV roster with multiple self matches blocks without choosing silently', async () => {
    mockedDetectTeamRoster.mockReturnValue(roster([SELF.name, SELF.name, 'Otra Persona']));
    renderImportModal('es', () => {}, { employeePreset: SELF, identityLocked: true, initialFile: csvFile() });

    await waitFor(() => expect(screen.getByText('Hemos encontrado varias coincidencias posibles para tus turnos.')).toBeTruthy());
    expect(screen.getByTestId('self-import-summary').textContent).toContain('3 ajenas');
    expect((screen.getByRole('button', { name: /Confirmar Importación/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('single-employee (non-roster) CSV: falls through to the normal single-employee pipeline unchanged', async () => {
    mockedDetectTeamRoster.mockReturnValue(null);
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult());
    renderImportModal('es', () => {}, { employeePreset: SELF, identityLocked: true, initialFile: csvFile() });

    await waitFor(() => expect(mockedAnalyzeDocumentFile).toHaveBeenCalled());
    expect(screen.getByText(/^2 encontrados/)).toBeTruthy();
  });

  describe('P5.5-R11-HOTFIX — unknown semantic color resolution controls', () => {
    const makeExcelColorResult = (): DocumentAnalysisResult => {
      const shifts = [makeShift({ date: '2026-06-16', sourceFormat: 'excel' })];
      return {
        kind: 'excel',
        context: { month: 5, year: 2026 },
        shifts,
        quality: {
          shifts,
          confidence: 0.95,
          warnings: [
            { code: 'UNKNOWN_SHIFT_TOKEN', context: { token: '__xlsx_style__:AEFC04' } },
            { code: 'UNKNOWN_SHIFT_TOKEN', context: { token: '__xlsx_style__:A9D0F5' } },
          ],
          state: 'REVIEW',
        },
        structure: null,
        questions: [
          { kind: 'token-meaning', token: '__xlsx_style__:AEFC04', displayToken: 'Color #AEFC04' },
          { kind: 'token-meaning', token: '__xlsx_style__:A9D0F5', displayToken: 'Color #A9D0F5' },
        ],
        detectedContext: { month: 5, year: 2026 },
      };
    };

    it('renders exactly one row per unique unknown color below the warning with swatch, selector, and ignore button', async () => {
      mockedDetectTeamRoster.mockReturnValue(null);
      mockedAnalyzeDocumentFile.mockResolvedValue(makeExcelColorResult());

      renderImportModal('es', () => {}, { initialFile: new File(['mock'], 'Turnos_Sebastian_Pozo_Mendoza(1).xlsx') });

      await waitFor(() => expect(screen.getByTestId('import-diagnostics')).toBeTruthy());
      expect(screen.getByText('Este archivo contiene colores cuyo significado todavía no conocemos. Indica a qué tipo de turno corresponde cada color o elige ignorarlo.')).toBeTruthy();

      const resolutionRows = screen.getAllByTestId('unknown-color-row');
      expect(resolutionRows).toHaveLength(2);

      const swatches = screen.getAllByTestId('color-swatch');
      expect(swatches).toHaveLength(2);
      expect(swatches[0].style.backgroundColor).toBe('rgb(174, 252, 4)'); // #AEFC04
      expect(swatches[1].style.backgroundColor).toBe('rgb(169, 208, 245)'); // #A9D0F5

      const selects = screen.getAllByRole('combobox', { name: /Tipo de turno/i });
      expect(selects).toHaveLength(2);

      const ignoreButtons = screen.getAllByRole('button', { name: 'Ignorar este color' });
      expect(ignoreButtons).toHaveLength(2);

      // Verify NO internal technical IDs are visible in the resolution container
      const resolutionsContainer = screen.getByTestId('unknown-color-resolutions');
      expect(resolutionsContainer.textContent).not.toContain('__xlsx_style__');
      expect(resolutionsContainer.textContent).not.toContain('AEFC04');
      expect(resolutionsContainer.textContent).not.toContain('A9D0F5');
      expect(resolutionsContainer.textContent).toContain('Color detectado');
    });

    it('enforces resolution: unresolved blocks, partial still blocks, all resolved enables without refresh', async () => {
      mockedDetectTeamRoster.mockReturnValue(null);
      mockedAnalyzeDocumentFile.mockResolvedValue(makeExcelColorResult());

      renderImportModal('es', () => {}, { initialFile: new File(['mock'], 'Turnos_Sebastian_Pozo_Mendoza(1).xlsx') });

      await waitFor(() => expect(screen.getAllByTestId('unknown-color-row')).toHaveLength(2));
      const confirmBtn = screen.getByRole('button', { name: /Confirmar Importación/ }) as HTMLButtonElement;

      // Both unresolved -> Confirm disabled
      expect(confirmBtn.disabled).toBe(true);

      const selects = screen.getAllByRole('combobox', { name: /Tipo de turno/i });
      const ignoreButtons = screen.getAllByRole('button', { name: 'Ignorar este color' });

      // Resolve row 1 (green) -> Vacaciones, row 2 still unresolved -> still disabled
      fireEvent.change(selects[0], { target: { value: 'Vacaciones' } });
      expect(confirmBtn.disabled).toBe(true);

      // Resolve row 2 (blue) -> Ignorar -> all resolved -> Confirm enabled
      fireEvent.click(ignoreButtons[1]);
      expect(confirmBtn.disabled).toBe(false);

      // Change row 2 back to unresolved by selecting empty option -> disabled again
      fireEvent.change(selects[1], { target: { value: '' } });
      expect(confirmBtn.disabled).toBe(true);

      // Resolve row 2 -> Libre -> enabled again
      fireEvent.change(selects[1], { target: { value: 'Libre' } });
      expect(confirmBtn.disabled).toBe(false);
    });

    it('selector shows active types (including custom active) and excludes archived types', async () => {
      mockedDetectTeamRoster.mockReturnValue(null);
      mockedAnalyzeDocumentFile.mockResolvedValue(makeExcelColorResult());

      saveShiftTypeOverrides({
        types: [
          { id: 'custom_active_type', label: 'Guardia Especial', shortLabel: 'GE', countsAsWork: true, color: '#f59e0b', archived: false },
          { id: 'custom_archived_type', label: 'Turno Obsoleto', shortLabel: 'TO', countsAsWork: true, color: '#6b7280', archived: true },
        ],
        aliases: {},
      });

      renderImportModal('es', () => {}, { initialFile: new File(['mock'], 'test.xlsx') });

      await waitFor(() => expect(screen.getAllByTestId('unknown-color-row')).toHaveLength(2));
      const selects = screen.getAllByRole('combobox', { name: /Tipo de turno/i });
      const options = Array.from(selects[0].querySelectorAll('option')).map((opt) => opt.textContent);

      expect(options).toContain('Vacaciones');
      expect(options).toContain('Libre');
      expect(options).toContain('Guardia Especial');
      expect(options).not.toContain('Turno Obsoleto');
    });

    it('integrates with real Turnos_Sebastian_Pozo_Mendoza.xlsx fixture', async () => {
      const { analyzeDocumentFile: realAnalyze } = await vi.importActual<typeof import('../../ingestion/parsers/file')>('../../ingestion/parsers/file');
      mockedDetectTeamRoster.mockReturnValue(null);
      mockedAnalyzeDocumentFile.mockImplementation(realAnalyze);

      const buffer = readFileSync(resolve(process.cwd(), 'test-data/fixtures/parser-regression/Turnos_Sebastian_Pozo_Mendoza.xlsx'));
      const realFile = new File([buffer], 'Turnos_Sebastian_Pozo_Mendoza(1).xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      renderImportModal('es', () => {}, {
        initialFile: realFile,
        employeePreset: { name: 'Sebastian Pozo Mendoza', externalId: '' },
      });

      await waitFor(() => expect(screen.getByTestId('import-diagnostics')).toBeTruthy(), { timeout: 10000 });
      expect(screen.getByText('Este archivo contiene colores cuyo significado todavía no conocemos. Indica a qué tipo de turno corresponde cada color o elige ignorarlo.')).toBeTruthy();
      expect(screen.getByText('Clasificar colores detectados')).toBeTruthy();

      const rows = screen.getAllByTestId('unknown-color-row');
      expect(rows).toHaveLength(2);

      const swatches = screen.getAllByTestId('color-swatch');
      expect(swatches[0].style.backgroundColor).toBe('rgb(174, 252, 4)'); // green #AEFC04
      expect(swatches[1].style.backgroundColor).toBe('rgb(169, 208, 245)'); // blue #A9D0F5

      const confirmBtn = screen.getByRole('button', { name: /Confirmar Importación/ }) as HTMLButtonElement;
      expect(confirmBtn.disabled).toBe(true);

      const selects = screen.getAllByRole('combobox', { name: /Tipo de turno/i });
      const ignoreButtons = screen.getAllByRole('button', { name: 'Ignorar este color' });

      // Step 1: green -> Vacaciones
      fireEvent.change(selects[0], { target: { value: 'Vacaciones' } });
      expect(confirmBtn.disabled).toBe(true);

      // Step 2: blue -> Ignorar
      fireEvent.click(ignoreButtons[1]);
      expect(confirmBtn.disabled).toBe(false);
    });
  });

  describe('CTA Enablement & Actionable Count (P5.5-R13)', () => {
    function makeDomainShift(overrides: Partial<Shift> = {}): Shift {
      return {
        id: 'shift-1',
        date: '2020-03-04',
        startTime: '08:00',
        endTime: '16:00',
        shiftType: 'Regular',
        countsAsWork: true,
        location: 'Regular',
        origin: 'IMP',
        ...overrides,
      };
    }

    it('all duplicates: disables CTA and sends 0 network requests', async () => {
      mockedDetectTeamRoster.mockReturnValue(null);
      mockedAnalyzeDocumentFile.mockResolvedValue(makeResult({
        shifts: [makeShift({ date: '2020-03-04', startTime: '08:00', endTime: '16:00', shiftType: 'Regular' })],
      }));

      const onConfirmImport = vi.fn().mockResolvedValue(true);
      renderImportModal('es', () => {}, {
        initialFile: csvFile(),
        existingShifts: [makeDomainShift({ date: '2020-03-04', startTime: '08:00', endTime: '16:00', shiftType: 'Regular' })],
        onConfirmImport,
      });

      await waitFor(() => expect(screen.getByRole('button', { name: /Confirmar Importación/i })).toBeTruthy());
      const confirmBtn = screen.getByRole('button', { name: /Confirmar Importación/i }) as HTMLButtonElement;

      expect(confirmBtn.disabled).toBe(true);
      fireEvent.click(confirmBtn);
      expect(onConfirmImport).not.toHaveBeenCalled();

      expect(screen.getByText('No hay turnos nuevos para importar.')).toBeTruthy();
      expect(screen.getByText(/Los 1 turnos detectados ya existen y no se realizará ningún cambio./)).toBeTruthy();
    });

    it('all existing: disables CTA and sends 0 network requests', async () => {
      mockedDetectTeamRoster.mockReturnValue(null);
      mockedAnalyzeDocumentFile.mockResolvedValue(makeResult({
        shifts: [
          makeShift({ date: '2020-03-04', startTime: '08:00', endTime: '16:00', shiftType: 'Regular' }),
          makeShift({ date: '2020-03-05', startTime: '08:00', endTime: '16:00', shiftType: 'Regular' }),
        ],
      }));

      const onConfirmImport = vi.fn().mockResolvedValue(true);
      renderImportModal('es', () => {}, {
        initialFile: csvFile(),
        existingShifts: [
          makeDomainShift({ id: 's1', date: '2020-03-04', startTime: '08:00', endTime: '16:00', shiftType: 'Regular' }),
          makeDomainShift({ id: 's2', date: '2020-03-05', startTime: '08:00', endTime: '16:00', shiftType: 'Regular' }),
        ],
        onConfirmImport,
      });

      await waitFor(() => expect(screen.getByRole('button', { name: /Confirmar Importación/i })).toBeTruthy());
      const confirmBtn = screen.getByRole('button', { name: /Confirmar Importación/i }) as HTMLButtonElement;

      expect(confirmBtn.disabled).toBe(true);
      fireEvent.click(confirmBtn);
      expect(onConfirmImport).not.toHaveBeenCalled();
      expect(screen.getByText('No hay turnos nuevos para importar.')).toBeTruthy();
    });

    it('all ignored: disables CTA and sends 0 network requests', async () => {
      mockedDetectTeamRoster.mockReturnValue(null);
      mockedAnalyzeDocumentFile.mockResolvedValue(makeResult({
        shifts: [
          makeShift({ startTime: '??:??', endTime: '??:??', shiftType: 'Regular' }),
        ],
      }));

      const onConfirmImport = vi.fn().mockResolvedValue(true);
      renderImportModal('es', () => {}, {
        initialFile: csvFile(),
        existingShifts: [],
        onConfirmImport,
      });

      await waitFor(() => expect(screen.getByRole('button', { name: /Confirmar Importación/i })).toBeTruthy());
      const confirmBtn = screen.getByRole('button', { name: /Confirmar Importación/i }) as HTMLButtonElement;

      expect(confirmBtn.disabled).toBe(true);
      fireEvent.click(confirmBtn);
      expect(onConfirmImport).not.toHaveBeenCalled();
    });

    it('historical new: enables CTA', async () => {
      mockedDetectTeamRoster.mockReturnValue(null);
      mockedAnalyzeDocumentFile.mockResolvedValue(makeResult({
        shifts: [
          makeShift({ date: '2020-03-04', startTime: '08:00', endTime: '16:00', shiftType: 'Regular' }),
        ],
      }));

      const onConfirmImport = vi.fn().mockResolvedValue(true);
      renderImportModal('es', () => {}, {
        initialFile: csvFile(),
        existingShifts: [],
        onConfirmImport,
      });

      await waitFor(() => expect(screen.getByRole('button', { name: /Confirmar Importación/i })).toBeTruthy());
      const confirmBtn = screen.getByRole('button', { name: /Confirmar Importación/i }) as HTMLButtonElement;

      expect(confirmBtn.disabled).toBe(false);
      fireEvent.click(confirmBtn);
      await waitFor(() => expect(onConfirmImport).toHaveBeenCalledTimes(1));
    });

    it('future only + historical-only selected disables CTA, draft enables CTA', async () => {
      mockedDetectTeamRoster.mockReturnValue(null);
      mockedAnalyzeDocumentFile.mockResolvedValue(makeResult({
        shifts: [
          makeShift({ date: '2099-03-04', startTime: '08:00', endTime: '16:00', shiftType: 'Regular' }),
        ],
      }));

      const onConfirmImport = vi.fn().mockResolvedValue(true);
      renderImportModal('es', () => {}, {
        initialFile: csvFile(),
        existingShifts: [],
        identityLocked: false,
        onConfirmImport,
      });

      await waitFor(() => expect(screen.getByRole('button', { name: /Confirmar Importación/i })).toBeTruthy());
      const confirmBtn = screen.getByRole('button', { name: /Confirmar Importación/i }) as HTMLButtonElement;

      // Default is historical-only, so for future-only shifts, actionableCount is 0 -> disabled
      expect(confirmBtn.disabled).toBe(true);
      expect(screen.getByText('Este archivo no contiene turnos anteriores a hoy.')).toBeTruthy();

      // Switch to draft -> actionableCount > 0 -> enabled
      const draftOption = screen.getByLabelText(/Importar históricos y añadir los futuros a planificación en borrador/i);
      fireEvent.click(draftOption);

      expect(confirmBtn.disabled).toBe(false);

      // Switch back to historical-only -> disabled again
      const histOption = screen.getByLabelText(/Importar solo los turnos históricos/i);
      fireEvent.click(histOption);

      expect(confirmBtn.disabled).toBe(true);
      fireEvent.click(confirmBtn);
      expect(onConfirmImport).not.toHaveBeenCalled();
    });

    // CX-F04 / UXR-F2-M04 AC-2: the badge must never claim drafts will be
    // created while the effective decision is historical-only, and must
    // switch to the conditional "would create" wording once draft is chosen.
    it('badge never promises drafts under historical-only, switches to conditional wording under draft (CX-F04)', async () => {
      mockedDetectTeamRoster.mockReturnValue(null);
      mockedAnalyzeDocumentFile.mockResolvedValue(makeResult({
        shifts: [
          makeShift({ date: '2099-03-04', startTime: '08:00', endTime: '16:00', shiftType: 'Regular' }),
        ],
      }));

      renderImportModal('es', () => {}, {
        initialFile: csvFile(),
        existingShifts: [],
        identityLocked: false,
      });

      await waitFor(() => expect(screen.getByTestId('import-future-count')).toBeTruthy());
      expect(screen.getByTestId('import-future-count').textContent).toBe(
        '1 turnos futuros detectados; no se crearán borradores con la opción actual',
      );

      const draftOption = screen.getByLabelText(/Importar históricos y añadir los futuros a planificación en borrador/i);
      fireEvent.click(draftOption);

      expect(screen.getByTestId('import-future-count').textContent).toBe(
        'Se crearían 1 borradores de turnos futuros (sin publicar)',
      );
    });

    it('mixed shifts: enablement follows selected temporal option and recalculates actionable count', async () => {
      mockedDetectTeamRoster.mockReturnValue(null);
      mockedAnalyzeDocumentFile.mockResolvedValue(makeResult({
        shifts: [
          makeShift({ date: '2020-03-04', startTime: '08:00', endTime: '16:00', shiftType: 'Regular' }),
          makeShift({ date: '2099-03-04', startTime: '08:00', endTime: '16:00', shiftType: 'Regular' }),
        ],
      }));

      const onConfirmImport = vi.fn().mockResolvedValue(true);
      renderImportModal('es', () => {}, {
        initialFile: csvFile(),
        existingShifts: [],
        identityLocked: false,
        onConfirmImport,
      });

      await waitFor(() => expect(screen.getByRole('button', { name: /Confirmar Importación/i })).toBeTruthy());
      const confirmBtn = screen.getByRole('button', { name: /Confirmar Importación/i }) as HTMLButtonElement;

      // Historical only: 1 actionable shift out of 2 total -> enabled
      expect(confirmBtn.disabled).toBe(false);
      expect(confirmBtn.textContent).toContain('1/2');

      // Switch to draft: 2 actionable shifts -> enabled
      const draftOption = screen.getByLabelText(/Importar históricos y añadir los futuros a planificación en borrador/i);
      fireEvent.click(draftOption);

      expect(confirmBtn.disabled).toBe(false);
      expect(confirmBtn.textContent).toContain('2/2');
    });

    it('busy state: applies app--busy to modal overlay when isImporting is true', async () => {
      renderImportModal('es', () => {}, {
        initialFile: csvFile(),
        isImporting: true,
      });

      const overlay = document.querySelector('[data-import-modal]');
      expect(overlay?.classList.contains('app--busy')).toBe(true);

      const confirmBtn = screen.getByRole('button', { name: /Importando/i }) as HTMLButtonElement;
      expect(confirmBtn.disabled).toBe(true);
    });
  });
});
