// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { loadFormatProfiles } from '../../lib/format-profiles';
import { resolveShiftTypeId } from '../../lib/shift-types';
import { analyzeItemsForImport } from '../../ingestion/analysis';
import { generateAssistantQuestions, AssistantQuestion } from '../../ingestion/assistant';
import { EmployeeSelector } from '../../ingestion/core/row-detection';
import { PdfTextItem } from '../../ingestion/core/text-items';
import { detectCalendarContextFromItems } from '../../ingestion/parsers/parse-items';
import {
  analyzeRosterTable,
  generateTabularQuestions,
  parseRosterTable,
} from '../../ingestion/tabular-assistant';
import {
  TYPE_A_FIXTURE_ITEMS,
  TYPE_A_SELECTOR,
} from '../../ingestion/fixtures/type-a.fixture';
import { ProfileAssistantPanel, AssistantCompletion } from './ProfileAssistantPanel';

setupLocalStorageMock();
afterEach(cleanup);

const CONTEXT = detectCalendarContextFromItems(TYPE_A_FIXTURE_ITEMS);

function setup(selector: EmployeeSelector) {
  const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, CONTEXT, selector);
  const questions = generateAssistantQuestions(TYPE_A_FIXTURE_ITEMS, CONTEXT, analysis);
  return { analysis, questions };
}

function renderPanel(
  questions: AssistantQuestion[],
  analysis: ReturnType<typeof analyzeItemsForImport> | null,
  selector: EmployeeSelector,
  onComplete: (result: AssistantCompletion) => void = () => {},
  onCancel: () => void = () => {},
  options: { items?: PdfTextItem[]; context?: typeof CONTEXT; table?: ReturnType<typeof parseRosterTable> } = {},
) {
  return render(
    <I18nProvider>
      <ProfileAssistantPanel
        questions={questions}
        items={options.items ?? TYPE_A_FIXTURE_ITEMS}
        context={options.context ?? CONTEXT}
        analysis={analysis}
        table={options.table ?? null}
        selector={selector}
        onComplete={onComplete}
        onCancel={onCancel}
      />
    </I18nProvider>,
  );
}

describe('ProfileAssistantPanel', () => {
  it('renders the row-selection question with the candidate labels', () => {
    const unknownSelector: EmployeeSelector = { employeeName: 'Nadie', employeeIdentifiers: [] };
    const { analysis, questions } = setup(unknownSelector);
    renderPanel(questions, analysis, unknownSelector);

    expect(screen.getByText('¿Cuál de estas filas eres tú?')).toBeTruthy();
    expect(screen.getByText('Carlos Ruiz (1002)')).toBeTruthy();
    expect(screen.getByText('Ana Martinez (1001)')).toBeTruthy();
    // Confirm stays disabled until a row is picked.
    expect((screen.getByText('Aplicar y continuar') as HTMLButtonElement).disabled).toBe(true);
  });

  it('completing with a selected row calls onComplete with re-parsed shifts', () => {
    const unknownSelector: EmployeeSelector = { employeeName: 'Nadie', employeeIdentifiers: [] };
    const { analysis, questions } = setup(unknownSelector);
    const onComplete = vi.fn();
    renderPanel(questions, analysis, unknownSelector, onComplete);

    fireEvent.click(screen.getByText('Ana Martinez (1001)'));
    fireEvent.click(screen.getByText('Aplicar y continuar'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0] as AssistantCompletion;
    expect(result.shifts.length).toBeGreaterThan(0);
    expect(result.quality.shifts).toEqual(result.shifts);
    expect(result.profile).not.toBeNull();
  });

  it('supports token-meaning work/rest answers and applies the aliases', () => {
    const { analysis, questions } = setup(TYPE_A_SELECTOR);
    expect(questions.map((q) => q.kind)).toEqual(['token-meaning', 'token-meaning']);
    const onComplete = vi.fn();
    renderPanel(questions, analysis, TYPE_A_SELECTOR, onComplete);

    expect(screen.getByText('¿Qué significa DL?')).toBeTruthy();
    expect(screen.getByText('¿Qué significa AJ?')).toBeTruthy();

    // DL = rest, AJ = work (defaults to the Regular type when none is chosen).
    const restButtons = screen.getAllByText('Descanso');
    const workButtons = screen.getAllByText('Trabajo');
    fireEvent.click(restButtons[0]);
    fireEvent.click(workButtons[1]);
    fireEvent.click(screen.getByText('Aplicar y continuar'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(resolveShiftTypeId('DL')).toBe('Libre');
    expect(resolveShiftTypeId('AJ')).toBe('Regular');
  });

  it('persists the format profile without any PII (no candidate labels, names or ids)', () => {
    const unknownSelector: EmployeeSelector = { employeeName: 'Nadie', employeeIdentifiers: [] };
    const { analysis, questions } = setup(unknownSelector);
    renderPanel(questions, analysis, unknownSelector);

    fireEvent.click(screen.getByText('Ana Martinez (1001)'));
    fireEvent.click(screen.getByText('Aplicar y continuar'));

    const profiles = loadFormatProfiles();
    expect(profiles).toHaveLength(1);
    const serialized = JSON.stringify(profiles[0]);
    expect(serialized).not.toContain('Ana');
    expect(serialized).not.toContain('Carlos');
    expect(serialized).not.toContain('1001');
    expect(serialized).not.toContain('1002');
    // The row survives only as a manual-row strategy + index.
    expect(profiles[0].employeeRow).toEqual({ strategy: 'manual-row', rowIndex: 1 });
  });

  it('does not persist anything when the save-profile checkbox is unchecked', () => {
    const { analysis, questions } = setup(TYPE_A_SELECTOR);
    const onComplete = vi.fn();
    renderPanel(questions, analysis, TYPE_A_SELECTOR, onComplete);

    fireEvent.click(screen.getByLabelText('Guardar este formato para próximos meses'));
    fireEvent.click(screen.getAllByText('Descanso')[0]);
    fireEvent.click(screen.getByText('Aplicar y continuar'));

    expect(loadFormatProfiles()).toHaveLength(0);
    expect((onComplete.mock.calls[0][0] as AssistantCompletion).profile).toBeNull();
  });

  it('calls onCancel without completing', () => {
    const { analysis, questions } = setup(TYPE_A_SELECTOR);
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    renderPanel(questions, analysis, TYPE_A_SELECTOR, onComplete, onCancel);

    fireEvent.click(screen.getByText('Cancelar'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('day-mapping: rejecting the proposed day asks for the correct one and re-parses with it', () => {
    // Grid whose last cell sits 20px from the 05/08 header (beyond the
    // profile's columnMatchMaxDistance): unmatched group → day-mapping question.
    const shiftedItems: PdfTextItem[] = [
      { text: 'PERIODO: AGOSTO 2026', x: 400, y: 450, width: 0, height: 0, page: 1 },
      { text: '01/08', x: 100, y: 400, width: 0, height: 0, page: 1 },
      { text: '02/08', x: 200, y: 400, width: 0, height: 0, page: 1 },
      { text: '03/08', x: 300, y: 400, width: 0, height: 0, page: 1 },
      { text: '04/08', x: 400, y: 400, width: 0, height: 0, page: 1 },
      { text: '05/08', x: 500, y: 400, width: 0, height: 0, page: 1 },
      { text: 'Carlos Ruiz', x: 30, y: 300, width: 0, height: 0, page: 1 },
      { text: '(1002)', x: 55, y: 300, width: 0, height: 0, page: 1 },
      { text: 'Ana Martinez', x: 30, y: 200, width: 0, height: 0, page: 1 },
      { text: '(1001)', x: 55, y: 200, width: 0, height: 0, page: 1 },
      { text: '08:00-16:00', x: 100, y: 200, width: 0, height: 0, page: 1 },
      { text: 'OFF', x: 200, y: 200, width: 0, height: 0, page: 1 },
      { text: '08:00-16:00', x: 300, y: 200, width: 0, height: 0, page: 1 },
      { text: 'OFF', x: 400, y: 200, width: 0, height: 0, page: 1 },
      { text: '17:00-01:00', x: 520, y: 200, width: 0, height: 0, page: 1 },
    ];
    const context = detectCalendarContextFromItems(shiftedItems);
    const analysis = analyzeItemsForImport(shiftedItems, context, TYPE_A_SELECTOR);
    const questions = generateAssistantQuestions(shiftedItems, context, analysis);
    expect(questions.some((q) => q.kind === 'day-mapping')).toBe(true);

    const onComplete = vi.fn();
    renderPanel(questions, analysis, TYPE_A_SELECTOR, onComplete, () => {}, { items: shiftedItems, context });

    expect(screen.getByText('¿Esta columna corresponde al día 5?')).toBeTruthy();
    // Reject → the corrected-day input appears; confirm stays disabled until filled.
    fireEvent.click(screen.getByText('No'));
    const dayInput = screen.getByLabelText('Indica a qué día corresponde esta columna');
    expect((screen.getByText('Aplicar y continuar') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(dayInput, { target: { value: '5' } });
    fireEvent.click(screen.getByText('Aplicar y continuar'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0] as AssistantCompletion;
    expect(result.shifts.some((shift) =>
      shift.date === '2026-08-05' && shift.startTime === '17:00' && shift.endTime === '01:00')).toBe(true);
    expect(result.profile?.dayColumnMap).toEqual({ 4: 5 });
  });

  it('CSV path: renders tabular questions without item analysis and completes PII-free', () => {
    const table = parseRosterTable([
      'Empleado,1,2,3',
      'Ana Martinez,08:00-16:00,OFF,ZZ',
      'Carlos Ruiz,OFF,OFF,OFF',
    ].join('\n'))!;
    const unknownSelector: EmployeeSelector = { employeeName: 'Nadie', employeeIdentifiers: [] };
    const questions = generateTabularQuestions(table, analyzeRosterTable(table, unknownSelector));
    expect(questions.map((q) => q.kind)).toEqual(['row-selection', 'day-mapping', 'token-meaning']);

    const onComplete = vi.fn();
    renderPanel(questions, null, unknownSelector, onComplete, () => {}, {
      items: [],
      context: { month: 7, year: 2026 },
      table,
    });

    // Pick the row, confirm the anchor day, classify ZZ as rest.
    fireEvent.click(screen.getByText('Ana Martinez'));
    fireEvent.click(screen.getByText('Sí'));
    fireEvent.click(screen.getByText('Descanso'));
    fireEvent.click(screen.getByText('Aplicar y continuar'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0] as AssistantCompletion;
    expect(result.shifts.map((shift) => ({ date: shift.date, type: shift.shiftType }))).toEqual([
      { date: '2026-08-01', type: 'Regular' },
      { date: '2026-08-02', type: 'Libre' },
      { date: '2026-08-03', type: 'Libre' },
    ]);

    const profiles = loadFormatProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].tabular).toEqual({
      dateColumnIndex: null,
      employeeColumnIndex: 0,
      valueColumnIndices: [1, 2, 3],
    });
    expect(profiles[0].dayColumnMap).toEqual({ 1: 1 });
    const serialized = JSON.stringify(profiles[0]);
    for (const pii of ['Ana', 'Martinez', 'Carlos', 'Ruiz']) {
      expect(serialized.includes(pii)).toBe(false);
    }
  });
});
