// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { I18nProvider } from '../../lib/i18n-react';
import { analyzeItemsForImport } from '../../ingestion/analysis';
import { generateAssistantQuestions, AssistantQuestion } from '../../ingestion/assistant';
import { EmployeeSelector } from '../../ingestion/core/row-detection';
import { detectCalendarContextFromItems } from '../../ingestion/parsers/parse-items';
import {
  TYPE_A_FIXTURE_ITEMS,
} from '../../ingestion/fixtures/type-a.fixture';
import { ProfileAssistantPanel, AssistantCompletion } from './ProfileAssistantPanel';

// GS-03 regression: on hybrid text+grid layouts the y-band around the picked
// candidate can hold no data cells, so the band-based re-parse returns [].
// The panel must then fall back to the label-based pipeline instead of
// surfacing a misleading empty result.
vi.mock('../../ingestion/assistant', async (importActual) => {
  const actual = await importActual<typeof import('../../ingestion/assistant')>();
  return { ...actual, parseWithSelectedRow: () => [] };
});

setupLocalStorageMock();
afterEach(cleanup);

const UNKNOWN_SELECTOR: EmployeeSelector = { employeeName: 'Nadie', employeeIdentifiers: [] };

describe('ProfileAssistantPanel selected-row fallback', () => {
  it('falls back to the label-based parse when the selected-row band is empty', () => {
    const context = detectCalendarContextFromItems(TYPE_A_FIXTURE_ITEMS);
    const analysis = analyzeItemsForImport(TYPE_A_FIXTURE_ITEMS, context, UNKNOWN_SELECTOR);
    const questions: AssistantQuestion[] = generateAssistantQuestions(TYPE_A_FIXTURE_ITEMS, context, analysis);
    expect(questions.some((q) => q.kind === 'row-selection')).toBe(true);

    const onComplete = vi.fn();
    render(
      <I18nProvider>
        <ProfileAssistantPanel
          questions={questions}
          items={TYPE_A_FIXTURE_ITEMS}
          context={context}
          analysis={analysis}
          table={null}
          selector={UNKNOWN_SELECTOR}
          onComplete={onComplete}
          onCancel={() => {}}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByText('Ana Martinez (1001)'));
    fireEvent.click(screen.getByText('Aplicar y continuar'));

    // Follow-up round: the picked row reveals DL/AJ — classify, then confirm.
    fireEvent.click(screen.getAllByText('Descanso')[0]);
    fireEvent.click(screen.getAllByText('Descanso')[1]);
    fireEvent.click(screen.getByText('Aplicar y continuar'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0] as AssistantCompletion;
    // The label-based fallback recovered the shifts the band parse missed.
    expect(result.shifts.length).toBeGreaterThan(0);
    expect(result.shifts.every((shift) => shift.date.startsWith('2026-08-'))).toBe(true);
  });
});
