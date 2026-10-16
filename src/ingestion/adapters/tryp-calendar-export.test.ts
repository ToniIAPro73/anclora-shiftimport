import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { interpretTrypCell, parseTrypCalendarExport } from './tryp-calendar-export';
import { detectSourceKind, isCompanyPlanSource, sourceSystemFor } from '../source-kind';

/** SYNTHETIC workbook with the structure of a TRYP individual calendar export (no real data). */
async function trypWorkbook(kind: 'Empleado' | 'Publicado', cells: Record<string, string>, options: { identifier?: string; legend?: boolean; sheetName?: string } = {}): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(options.sheetName ?? (kind === 'Empleado' ? 'Calendario empleado' : 'Calendario publicado'));
  sheet.addRow([`Copia no Controlada si se Imprime - Calendario ${kind === 'Empleado' ? 'empleado' : 'publicado'}`]);
  sheet.addRow(['Persona Sintetica Calendario 2026']);
  sheet.addRow([null, ...Array.from({ length: 31 }, (_, i) => i + 1)]);
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  months.forEach((month, m) => {
    const row: Array<string | null> = [month, ...Array.from({ length: 31 }, () => null)];
    for (const [key, value] of Object.entries(cells)) {
      const [d, mo] = key.split('/').map(Number);
      if (mo - 1 === m) row[d] = value;
    }
    sheet.addRow(row);
  });
  if (options.legend !== false) {
    const legend = wb.addWorksheet('Leyenda');
    legend.addRow(['Filtrado', 'Filtrado']);
    legend.addRow(['Calendario', kind]);
    legend.addRow(['Nómina', options.identifier ?? '9999']);
    legend.addRow(['Nombre Completo', 'Persona Sintetica']);
    legend.addRow(['Fecha inicio', '01/01/2026']);
    legend.addRow(['Fecha fin', '31/12/2026']);
  }
  const buffer = await wb.xlsx.writeBuffer();
  return new File([buffer as unknown as BlobPart], 'export.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const EMPLOYEE_CELLS = {
  '1/1': '11:00 \n19:00', '2/1': 'DL', '3/1': 'AJ',
  '23/3': '17:00 \n01:00 ! (DCF)', '16/6': '17:00 \n01:00 ! (DCF)', '23/6': '15:00 \n23:00 ! (DCF)', '2/7': '21:00 \n05:00 ! (DCF)', '10/7': '13:00 \n21:00 ! (DCF)',
  '8/4': '(V)', '2/6': '(B)',
  '14/8': '17:00 \n01:00 [CAMBIO DE TURNO PARA CUBRIR OPERATIVA]', '27/9': '09:00 \n17:00 [cambio por operativa, disculpa las molestias]',
};

describe('source kind detection (structural evidence, never the file name)', () => {
  it('maps the legend to the source kind', () => {
    expect(detectSourceKind({ legendCalendar: 'Empleado' })).toBe('EMPLOYEE_CALENDAR_EXPORT');
    expect(detectSourceKind({ legendCalendar: ' Publicado ' })).toBe('PUBLISHED_CALENDAR_EXPORT');
    expect(detectSourceKind({ team: { employeeCount: 62, withPayrollId: 62 } })).toBe('TEAM_SCHEDULE_EXPORT');
    expect(detectSourceKind({})).toBe('UNKNOWN');
    expect(detectSourceKind({ team: { employeeCount: 1, withPayrollId: 1 } })).toBe('UNKNOWN');
  });
  it('sheet names are only a secondary signal and the legend wins', () => {
    expect(detectSourceKind({ sheetNames: ['Calendario publicado', 'Leyenda'] })).toBe('PUBLISHED_CALENDAR_EXPORT');
    expect(detectSourceKind({ legendCalendar: 'Empleado', sheetNames: ['Calendario publicado'] })).toBe('EMPLOYEE_CALENDAR_EXPORT');
  });
  it('company-plan sources are published calendars and team schedules; identities are namespaced per source system', () => {
    expect(isCompanyPlanSource('PUBLISHED_CALENDAR_EXPORT')).toBe(true);
    expect(isCompanyPlanSource('TEAM_SCHEDULE_EXPORT')).toBe(true);
    expect(isCompanyPlanSource('EMPLOYEE_CALENDAR_EXPORT')).toBe(false);
    expect(sourceSystemFor('EMPLOYEE_CALENDAR_EXPORT')).toBe('TRYP_EMPLOYEE_CALENDAR');
    expect(sourceSystemFor('TEAM_SCHEDULE_EXPORT')).toBe('TRYP_TEAM_SCHEDULE');
  });
});

describe('TRYP cell interpretation', () => {
  it('keeps the existence of DCF without inventing its hours', () => {
    expect(interpretTrypCell('17:00 \n01:00 ! (DCF)')).toMatchObject({ kind: 'shift', startTime: '17:00', endTime: '01:00', dcf: true, comment: null });
  });
  it('reads observations and codes', () => {
    expect(interpretTrypCell('17:00 01:00 [CAMBIO DE TURNO]')).toMatchObject({ kind: 'shift', comment: 'CAMBIO DE TURNO', dcf: false });
    expect(interpretTrypCell('(V)').kind).toBe('vacation');
    expect(interpretTrypCell('(B)').kind).toBe('sick');
    expect(interpretTrypCell('AJ').kind).toBe('dayOff');
    expect(interpretTrypCell('  ').kind).toBe('empty');
    expect(interpretTrypCell('XYZ').kind).toBe('unknown');
  });
});

describe('parseTrypCalendarExport', () => {
  it('Calendario empleado: source kind, identifier, DCF x5, sick leave, vacation, comments', async () => {
    const result = await parseTrypCalendarExport(await trypWorkbook('Empleado', EMPLOYEE_CELLS, { identifier: '6888' }));
    expect(result?.sourceKind).toBe('EMPLOYEE_CALENDAR_EXPORT');
    expect(result?.sourceSystem).toBe('TRYP_EMPLOYEE_CALENDAR');
    expect(result?.sourceIdentifier).toBe('6888');
    expect(result?.year).toBe(2026);
    expect(result?.unrecognized).toEqual([]);
    const byDate = new Map(result?.rows.map((r) => [r.date, r]));
    expect(result?.rows.filter((r) => r.dcf).map((r) => r.date)).toEqual(['2026-03-23', '2026-06-16', '2026-06-23', '2026-07-02', '2026-07-10']);
    expect(byDate.get('2026-03-23')).toMatchObject({ shiftType: 'Regular', startTime: '17:00', endTime: '01:00', dcf: true });
    expect(byDate.get('2026-06-02')).toMatchObject({ shiftType: 'Baja', startTime: '', endTime: '' });
    expect(byDate.get('2026-04-08')?.shiftType).toBe('Vacaciones');
    expect(byDate.get('2026-01-02')?.shiftType).toBe('Libre');
    expect(byDate.get('2026-01-03')?.shiftType).toBe('Libre'); // AJ == day off
    expect(result?.rows.filter((r) => r.comment).map((r) => r.comment)).toEqual(['CAMBIO DE TURNO PARA CUBRIR OPERATIVA', 'cambio por operativa, disculpa las molestias']);
  });

  it('Calendario publicado is a different source kind and carries the planned 02/06 shift', async () => {
    const result = await parseTrypCalendarExport(await trypWorkbook('Publicado', { '2/6': '14:00 \n22:00', '1/1': '11:00 \n19:00' }, { identifier: '6888' }));
    expect(result?.sourceKind).toBe('PUBLISHED_CALENDAR_EXPORT');
    expect(result?.rows.find((r) => r.date === '2026-06-02')).toMatchObject({ shiftType: 'Regular', startTime: '14:00', endTime: '22:00', dcf: false });
  });

  it('unknown tokens are reported, never guessed; non-TRYP workbooks return null', async () => {
    const odd = await parseTrypCalendarExport(await trypWorkbook('Empleado', { '5/5': 'ZZ' }));
    expect(odd?.unrecognized).toEqual([{ date: '2026-05-05', text: 'ZZ' }]);
    expect(odd?.rows).toEqual([]);
    expect(await parseTrypCalendarExport(await trypWorkbook('Empleado', EMPLOYEE_CELLS, { legend: false, sheetName: 'Hoja1' }))).toBeNull();
    // with no legend the sheet name is a secondary signal only
    expect((await parseTrypCalendarExport(await trypWorkbook('Publicado', { '2/6': '14:00 \n22:00' }, { legend: false })))?.sourceKind).toBe('PUBLISHED_CALENDAR_EXPORT');
  });
});
