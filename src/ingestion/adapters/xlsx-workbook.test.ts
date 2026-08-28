import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { IngestionError } from '../../lib/ingestion-errors';
import { parseXlsxTeamWorkbook } from './xlsx-workbook';

async function workbookFile(name: string, build: (wb: ExcelJS.Workbook) => void): Promise<File> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  const buffer = await wb.xlsx.writeBuffer();
  return new File([buffer as unknown as BlobPart], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

const ROSTER_HEADER = ['employeeId', 'employeeName', 'date', 'shiftType', 'startTime', 'endTime'];

describe('parseXlsxTeamWorkbook', () => {
  it('A1: a single valid sheet keeps working exactly like before', async () => {
    const file = await workbookFile('single.xlsx', (wb) => {
      const sheet = wb.addWorksheet('Turnos');
      sheet.addRow(ROSTER_HEADER);
      sheet.addRow(['OPE-001', 'Ana García', '2026-09-01', 'M', '06:00', '14:00']);
    });
    const result = await parseXlsxTeamWorkbook(file);
    expect(result.sheets).toEqual([{ sheetName: 'Turnos', status: 'processed', rowCount: 1 }]);
    expect(result.employees).toHaveLength(1);
  });

  it('A2/A4: multiple sheets with compatible layouts are both processed and merged without duplication', async () => {
    const file = await workbookFile('multi.xlsx', (wb) => {
      const logistica = wb.addWorksheet('Logística');
      logistica.addRow(ROSTER_HEADER);
      logistica.addRow(['LOG-001', 'Adrián López', '2026-09-01', 'M', '07:00', '15:00']);
      const operaciones = wb.addWorksheet('Operaciones');
      operaciones.addRow(ROSTER_HEADER);
      operaciones.addRow(['OPE-001', 'Ana García', '2026-09-01', 'M', '06:00', '14:00']);
    });
    const result = await parseXlsxTeamWorkbook(file);
    expect(result.sheets.map((s) => s.status)).toEqual(['processed', 'processed']);
    expect(result.employees).toHaveLength(2);
  });

  it('A3: empty and instructions sheets are classified, not imported as data', async () => {
    const file = await workbookFile('mixed.xlsx', (wb) => {
      const roster = wb.addWorksheet('Turnos');
      roster.addRow(ROSTER_HEADER);
      roster.addRow(['OPE-001', 'Ana García', '2026-09-01', 'M', '06:00', '14:00']);
      wb.addWorksheet('Notas'); // truly empty
      const instructions = wb.addWorksheet('Instrucciones');
      instructions.addRow(['Leer antes de rellenar']);
    });
    const result = await parseXlsxTeamWorkbook(file);
    const byName = new Map(result.sheets.map((s) => [s.sheetName, s.status]));
    expect(byName.get('Turnos')).toBe('processed');
    expect(byName.get('Notas')).toBe('empty');
    expect(byName.get('Instrucciones')).toBe('ignored');
    expect(result.employees).toHaveLength(1);
  });

  it('A5: a sheet with an unrecognizable layout is ignored, not thrown', async () => {
    const file = await workbookFile('heterogeneous.xlsx', (wb) => {
      const roster = wb.addWorksheet('Turnos');
      roster.addRow(ROSTER_HEADER);
      roster.addRow(['OPE-001', 'Ana García', '2026-09-01', 'M', '06:00', '14:00']);
      const weird = wb.addWorksheet('Resumen');
      weird.addRow(['Total horas', 'Total turnos']);
      weird.addRow(['320', '40']);
    });
    const result = await parseXlsxTeamWorkbook(file);
    expect(result.sheets.find((s) => s.sheetName === 'Resumen')?.status).toBe('ignored');
    expect(result.employees).toHaveLength(1);
  });

  it('A6: an error-free sheet survives even when another sheet is unusable', async () => {
    const file = await workbookFile('partial.xlsx', (wb) => {
      const good = wb.addWorksheet('Buena');
      good.addRow(ROSTER_HEADER);
      good.addRow(['OPE-001', 'Ana García', '2026-09-01', 'M', '06:00', '14:00']);
      const bad = wb.addWorksheet('Mala');
      bad.addRow(ROSTER_HEADER);
      bad.addRow(['OPE-002', 'Biel', 'fecha-invalida', 'M', '06:00', '14:00']);
    });
    const result = await parseXlsxTeamWorkbook(file);
    expect(result.employees).toHaveLength(1);
    expect(result.diagnostics.some((d) => d.code === 'INVALID_DATE')).toBe(true);
  });

  it('A7: same employee/date across two sheets is flagged as a duplicate, not double-imported', async () => {
    const file = await workbookFile('dup.xlsx', (wb) => {
      const s1 = wb.addWorksheet('Hoja1');
      s1.addRow(ROSTER_HEADER);
      s1.addRow(['OPE-001', 'Ana García', '2026-09-01', 'M', '06:00', '14:00']);
      const s2 = wb.addWorksheet('Hoja2');
      s2.addRow(ROSTER_HEADER);
      s2.addRow(['OPE-001', 'Ana García', '2026-09-01', 'T', '14:00', '22:00']);
    });
    const result = await parseXlsxTeamWorkbook(file);
    expect(result.employees[0].shifts).toHaveLength(1);
    expect(result.diagnostics.some((d) => d.code === 'DUPLICATE_RECORD')).toBe(true);
  });

  it('A8: sheet name matching an area is a hint only, never an authority — no area column is not overridden', async () => {
    const file = await workbookFile('area-hint.xlsx', (wb) => {
      const sheet = wb.addWorksheet('Logística');
      sheet.addRow(['employeeId', 'employeeName', 'area', 'date', 'shiftType', 'startTime', 'endTime']);
      sheet.addRow(['LOG-001', 'Adrián López', 'Operaciones', '2026-09-01', 'M', '07:00', '15:00']);
    });
    const result = await parseXlsxTeamWorkbook(file);
    // Explicit area column ("Operaciones") wins over the sheet name hint ("Logística").
    expect(result.employees[0].areaName).toBe('Operaciones');
  });

  it('throws INVALID_XLSX for a file ExcelJS cannot load', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'broken.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await expect(parseXlsxTeamWorkbook(file)).rejects.toBeInstanceOf(IngestionError);
  });

  it('processes the multi-area acceptance fixture: both rosters, ignored notes/instructions, deliberate incidents detected', async () => {
    const buffer = readFileSync(
      resolve(process.cwd(), 'test-data/scenarios/anclora-group-shift-ingestion/05_turnos_multi_area_2026-09_01-15.xlsx'),
    );
    const file = new File([buffer], '05_turnos_multi_area_2026-09_01-15.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const result = await parseXlsxTeamWorkbook(file);

    const byName = new Map(result.sheets.map((s) => [s.sheetName, s.status]));
    expect(byName.get('Logística')).toBe('processed');
    expect(byName.get('Operaciones')).toBe('processed');
    expect(byName.get('Instrucciones')).toBe('ignored');
    expect(byName.get('Notas')).toBe('empty');

    // 30 Logística + 15 Operaciones = 45 distinct employees.
    expect(result.employees).toHaveLength(45);

    const log007 = result.employees.find((e) => e.externalEmployeeId === 'LOG-007');
    expect(log007?.shifts.find((s) => s.date === '2026-09-05')?.shiftType).toBe('X1');

    const ope004 = result.employees.find((e) => e.externalEmployeeId === 'OPE-004');
    expect(ope004?.shifts.filter((s) => s.date === '2026-09-06')).toHaveLength(1);
    expect(result.diagnostics.some((d) => d.code === 'DUPLICATE_RECORD')).toBe(true);
    expect(result.diagnostics.some((d) => d.code === 'INCOMPLETE_SHIFT')).toBe(true);
  });
});
