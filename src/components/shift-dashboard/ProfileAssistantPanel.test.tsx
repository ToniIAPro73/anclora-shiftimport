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
import { detectCalendarContextFromItems } from '../../ingestion/parsers/parse-items';
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
  analysis: ReturnType<typeof analyzeItemsForImport>,
  selector: EmployeeSelector,
  onComplete: (result: AssistantCompletion) => void = () => {},
  onCancel: () => void = () => {},
) {
  return render(
    <I18nProvider>
      <ProfileAssistantPanel
        questions={questions}
        items={TYPE_A_FIXTURE_ITEMS}
        context={CONTEXT}
        analysis={analysis}
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
});
