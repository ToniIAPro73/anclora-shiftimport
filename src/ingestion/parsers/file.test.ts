import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../../test-utils/local-storage';
import { mergeShiftTypeOverrides, SHIFT_TYPE_PRESET_EXAMPLE } from '../../lib/shift-types';
import { ParsedCalendarShift } from '../../lib/import-types';
import {
  cellPositionToItem,
  classifyDocument,
  detectCalendarContext,
  extractExcelItems,
  extractTabularItems,
  parseEmployeeShiftsFromFile,
} from './file';

setupLocalStorageMock();

const makeFile = (name: string, content: string | BlobPart[], type = '') =>
  new File(typeof content === 'string' ? [content] : content, name, { type });

const summarize = (shifts: ParsedCalendarShift[]) =>
  shifts.map((shift) => ({
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    shiftType: shift.shiftType,
    isValid: shift.isValid,
  }));

// Synthetic TYPE_A schedule, tabular form: marker column + 5 day columns.
const TYPE_A_CSV = [
  'PERIODO: AGOSTO 2026',
  'Empleado,01/08,02/08,03/08,04/08,05/08',
  'Carlos Ruiz,OFF,OFF,OFF,OFF,OFF',
  'Ana Martinez,17:00-01:00,OFF,DL,08:00-12:00 -- 16:00-20:00,OFF',
].join('\n');

const ANA_SELECTOR = { employeeName: 'Ana Martinez', employeeIdentifiers: [] };

describe('classifyDocument', () => {
  it('classifies by extension', () => {
    expect(classifyDocument(makeFile('cuadrante.pdf', ''))).toBe('pdf');
    expect(classifyDocument(makeFile('foto.png', ''))).toBe('image');
    expect(classifyDocument(makeFile('foto.JPG', ''))).toBe('image');
    expect(classifyDocument(makeFile('turnos.xlsx', ''))).toBe('excel');
    expect(classifyDocument(makeFile('turnos.csv', ''))).toBe('csv');
    expect(classifyDocument(makeFile('turnos.txt', ''))).toBe('text');
    expect(classifyDocument(makeFile('turnos.odt', ''))).toBe('unknown');
  });

  it('falls back to MIME type', () => {
    expect(classifyDocument(new File([''], 'foto', { type: 'image/png' }))).toBe('image');
    expect(classifyDocument(new File([''], 'doc', { type: 'text/plain' }))).toBe('text');
    expect(classifyDocument(new File([''], 'doc', { type: 'application/pdf' }))).toBe('pdf');
  });
});

describe('extractTabularItems', () => {
  it('maps marker column and data columns to positions', () => {
    const items = extractTabularItems('Ana Martinez,17:00-01:00,OFF');
    const marker = items.find((item) => item.text === 'Ana Martinez');
    const firstCell = items.find((item) => item.text === '17:00-01:00');
    const secondCell = items.find((item) => item.text === 'OFF');
    expect(marker?.x).toBeLessThan(80);
    expect(firstCell?.x).toBe(140);
    expect(secondCell?.x).toBe(240);
    expect(marker?.y).toBe(firstCell?.y);
    expect(marker?.x).toBeLessThan(firstCell?.x ?? 0);
  });
});

describe('parseEmployeeShiftsFromFile — CSV TYPE_A', () => {
  it('produces the golden result without the company preset', async () => {
    const file = makeFile('cuadrante.csv', TYPE_A_CSV, 'text/csv');
    const context = await detectCalendarContext(file);
    expect(context).toEqual({ month: 7, year: 2026 });

    const shifts = await parseEmployeeShiftsFromFile(file, context, ANA_SELECTOR);
    expect(shifts[0]?.sourceFormat).toBe('csv');
    expect(summarize(shifts)).toEqual([
      { date: '2026-08-01', startTime: '17:00', endTime: '01:00', shiftType: 'Regular', isValid: true },
      { date: '2026-08-02', startTime: '', endTime: '', shiftType: 'Libre', isValid: true },
      { date: '2026-08-04', startTime: '08:00', endTime: '12:00', shiftType: 'Regular', isValid: true },
      { date: '2026-08-04', startTime: '16:00', endTime: '20:00', shiftType: 'Regular', isValid: true },
      { date: '2026-08-05', startTime: '', endTime: '', shiftType: 'Libre', isValid: true },
    ]);
  });

  it('resolves company aliases with the preset loaded', async () => {
    mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
    const file = makeFile('cuadrante.csv', TYPE_A_CSV, 'text/csv');
    const context = await detectCalendarContext(file);
    const shifts = await parseEmployeeShiftsFromFile(file, context, ANA_SELECTOR);
    expect(summarize(shifts)).toContainEqual({
      date: '2026-08-03',
      startTime: '',
      endTime: '',
      shiftType: 'Libre',
      isValid: true,
    });
  });

  it('throws for an unsupported document kind', async () => {
    const file = makeFile('turnos.odt', 'hola', 'application/vnd.oasis.opendocument.text');
    await expect(parseEmployeeShiftsFromFile(file, { month: 7, year: 2026 }, ANA_SELECTOR))
      .rejects.toThrow(/no soportado/i);
  });
});

describe('extractExcelItems', () => {
  it('reads an in-memory workbook as positioned items', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Cuadrante');
    sheet.addRow(['PERIODO: AGOSTO 2026']);
    sheet.addRow(['Empleado', '01/08', '02/08', '03/08']);
    sheet.addRow(['Carlos Ruiz', 'OFF', 'OFF', 'OFF']);
    sheet.addRow(['Ana Martinez', '17:00-01:00', 'OFF', 'DL']);

    const buffer = await workbook.xlsx.writeBuffer();
    const file = makeFile('cuadrante.xlsx', [buffer], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(classifyDocument(file)).toBe('excel');

    const items = await extractExcelItems(file);
    const marker = items.find((item) => item.text === 'Ana Martinez');
    const firstDay = items.find((item) => item.text === '01/08');
    const cell = items.find((item) => item.text === '17:00-01:00');
    expect(marker?.x).toBeLessThan(80);
    expect(firstDay?.x).toBe(140);
    expect(cell?.x).toBe(firstDay?.x);
  });
});

describe('parseEmployeeShiftsFromFile — canonical roster CSV', () => {
  const ROSTER_CSV = [
    'fecha,inicio,fin,tipo',
    '01/08/2026,08:00,14:00,Regular',
    '02/08/2026,,,Libre',
    '03/08/2026,17:00,01:00,',
    '04/08/2026,8:00,12:00,Extras',
  ].join('\n');

  const rosterRows = (shifts: ParsedCalendarShift[]) => shifts.map((shift) => ({
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    shiftType: shift.shiftType,
    sourceFormat: shift.sourceFormat,
  }));

  it('parses rows with alias headers into normalized shifts', async () => {
    const file = makeFile('roster.csv', ROSTER_CSV, 'text/csv');
    const context = await detectCalendarContext(file);
    expect(context).toEqual({ month: 7, year: 2026 });

    const shifts = await parseEmployeeShiftsFromFile(file, context, ANA_SELECTOR);
    expect(rosterRows(shifts)).toEqual([
      { date: '2026-08-01', startTime: '08:00', endTime: '14:00', shiftType: 'Regular', sourceFormat: 'csv' },
      { date: '2026-08-02', startTime: '', endTime: '', shiftType: 'Libre', sourceFormat: 'csv' },
      { date: '2026-08-03', startTime: '17:00', endTime: '01:00', shiftType: 'Regular', sourceFormat: 'csv' },
      { date: '2026-08-04', startTime: '08:00', endTime: '12:00', shiftType: 'Extras', sourceFormat: 'csv' },
    ]);
  });

  it('is independent of the file extension: same roster via .txt works', async () => {
    const file = makeFile('roster.txt', ROSTER_CSV, 'text/plain');
    const context = await detectCalendarContext(file);
    const shifts = await parseEmployeeShiftsFromFile(file, context, ANA_SELECTOR);
    expect(shifts[0]?.sourceFormat).toBe('text');
    expect(shifts.length).toBe(4);
  });

  it('accepts English and accented header aliases', async () => {
    const csv = [
      'Fecha de trabajo, Entrada, Salida, Tipo de turno',
      '01/08/2026, 08:00, 14:00, Libre',
    ].join('\n');
    const file = makeFile('roster2.csv', csv, 'text/csv');
    const context = await detectCalendarContext(file);
    const shifts = await parseEmployeeShiftsFromFile(file, context, ANA_SELECTOR);
    expect(shifts).toHaveLength(1);
    expect(shifts[0]).toMatchObject({ date: '2026-08-01', startTime: '08:00', endTime: '14:00', shiftType: 'Libre' });
  });
});

describe('cellPositionToItem', () => {
  it('places the marker column left of the data area', () => {
    expect(cellPositionToItem('X', 0, 0).x).toBe(40);
    expect(cellPositionToItem('X', 1, 0).x).toBe(140);
  });
});