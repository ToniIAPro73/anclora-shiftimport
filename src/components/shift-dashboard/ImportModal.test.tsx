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
import { detectTeamRoster } from '../../ingestion/team-roster';
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
    onConfirmImport?: (shifts: unknown, period: unknown, selector?: unknown) => Promise<boolean>;
    initialFile?: File | null;
    employeePreset?: { name: string; externalId: string } | null;
    identityLocked?: boolean;
    organizationId?: string | null;
  } = {},
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
        employeePreset={options.employeePreset ?? null}
        identityLocked={options.identityLocked ?? false}
        organizationId={options.organizationId ?? null}
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

  it('single-employee (non-roster) CSV: falls through to the normal single-employee pipeline unchanged', async () => {
    mockedDetectTeamRoster.mockReturnValue(null);
    mockedAnalyzeDocumentFile.mockResolvedValue(makeResult());
    renderImportModal('es', () => {}, { employeePreset: SELF, identityLocked: true, initialFile: csvFile() });

    await waitFor(() => expect(mockedAnalyzeDocumentFile).toHaveBeenCalled());
    expect(screen.getByText(/^2 encontrados/)).toBeTruthy();
  });
});
