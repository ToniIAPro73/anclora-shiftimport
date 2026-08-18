import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { detectCalendarContextFromItems, parseShiftsFromItems } from './parse-items';
import { mergeShiftTypeOverrides, SHIFT_TYPE_PRESET_EXAMPLE } from '../../lib/shift-types';
import { PdfTextItem } from '../core/text-items';
import {
  TYPE_A_EXPECTED,
  TYPE_A_EXPECTED_WITH_PRESET,
  TYPE_A_FIXTURE_ITEMS,
  TYPE_A_SELECTOR,
} from '../fixtures/type-a.fixture';
import {
  TYPE_B_EXPECTED_WITH_PRESET,
  TYPE_B_FIXTURE_ITEMS,
  TYPE_B_SELECTOR,
} from '../fixtures/type-b.fixture';

setupLocalStorageMock();

const summarize = (shifts: ReturnType<typeof parseShiftsFromItems>) =>
  shifts.map((shift) => ({
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    shiftType: shift.shiftType,
    isValid: shift.isValid,
  }));

describe('calendar context detection', () => {
  it('detects TYPE_A month from day-header vote and year from document', () => {
    const context = detectCalendarContextFromItems(TYPE_A_FIXTURE_ITEMS);
    expect(context).toEqual({ month: 7, year: 2026 });
  });

  it('detects TYPE_B month from month-name scan', () => {
    const context = detectCalendarContextFromItems(TYPE_B_FIXTURE_ITEMS);
    expect(context).toEqual({ month: 6, year: 2026 });
  });
});

describe('parseShiftsFromItems — TYPE_A fixture', () => {
  it('produces the golden normalized result without company preset', () => {
    const context = detectCalendarContextFromItems(TYPE_A_FIXTURE_ITEMS);
    const shifts = parseShiftsFromItems(TYPE_A_FIXTURE_ITEMS, context, TYPE_A_SELECTOR);
    expect(summarize(shifts)).toEqual(TYPE_A_EXPECTED);
  });

  it('resolves company aliases (DL/AJ -> Libre) with the preset loaded', () => {
    mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
    const context = detectCalendarContextFromItems(TYPE_A_FIXTURE_ITEMS);
    const shifts = parseShiftsFromItems(TYPE_A_FIXTURE_ITEMS, context, TYPE_A_SELECTOR);
    expect(summarize(shifts)).toEqual(TYPE_A_EXPECTED_WITH_PRESET);
  });
});

describe('parseShiftsFromItems — TYPE_B fixture', () => {
  it('produces the golden normalized result with the company preset loaded', () => {
    mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
    const context = detectCalendarContextFromItems(TYPE_B_FIXTURE_ITEMS);
    const shifts = parseShiftsFromItems(TYPE_B_FIXTURE_ITEMS, context, TYPE_B_SELECTOR);
    expect(summarize(shifts)).toEqual(TYPE_B_EXPECTED_WITH_PRESET);
  });
});

describe('parseShiftsFromItems — failure modes', () => {
  it('throws employee-not-found for an unknown identifier', () => {
    const context = detectCalendarContextFromItems(TYPE_A_FIXTURE_ITEMS);
    expect(() =>
      parseShiftsFromItems(TYPE_A_FIXTURE_ITEMS, context, { employeeName: 'Nadie', employeeIdentifiers: ['9999'] }),
    ).toThrow(/No se encontro la fila/);
  });

  it('throws for an unsupported layout', () => {
    const items: PdfTextItem[] = [{ text: 'hola', x: 10, y: 10, width: 0, height: 0, page: 1 }];
    const context = detectCalendarContextFromItems(items);
    expect(() => parseShiftsFromItems(items, context, TYPE_A_SELECTOR)).toThrow(/identificar el formato/);
  });
});
