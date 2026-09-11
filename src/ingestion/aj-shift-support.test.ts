import { describe, expect, it } from 'vitest';
import { setupLocalStorageMock } from '../test-utils/local-storage';
import {
  getShiftTypeColor,
  getShiftTypeDefinition,
  isDayOffCode,
  mergeShiftTypeOverrides,
  resolveShiftTypeId,
  SHIFT_TYPE_PRESET_EXAMPLE,
} from '../lib/shift-types';
import { translateShiftTypeLabel } from '../lib/i18n';
import { durationMinutes, isOvernight } from '../lib/time';
import { buildShiftEntriesForDay } from './core/shift-builder';
import { expandShiftTokens } from './core/tokens';
import { parseXlsxTeamWorkbook } from './adapters/xlsx-workbook';
import { normalizeStructuredRows } from './adapters/structured-rows';
import { isExplicitlyIgnoredCode } from './core/ignored-codes';

setupLocalStorageMock();

describe('Soporte completo de turnos AJ (Equivalencia con DL → Día libre)', () => {
  describe('1. Normalización del token AJ y delimitación de código', () => {
    it('reconoce AJ de forma insensible a mayúsculas y minúsculas', () => {
      expect(isDayOffCode('AJ')).toBe(true);
      expect(isDayOffCode('aj')).toBe(true);
      expect(isDayOffCode('Aj')).toBe(true);
      expect(isDayOffCode('aJ')).toBe(true);
    });

    it('ignora espacios en blanco al inicio o al final', () => {
      expect(isDayOffCode('  AJ  ')).toBe(true);
      expect(isDayOffCode('\taj\t')).toBe(true);
      expect(isDayOffCode('  Aj ')).toBe(true);
    });

    it('no genera falsos positivos con subcadenas o códigos con sufijo/prefijo (tokens delimitados)', () => {
      expect(isDayOffCode('AJ1')).toBe(false);
      expect(isDayOffCode('BAJ')).toBe(false);
      expect(isDayOffCode('AJ-2')).toBe(false);
      expect(isDayOffCode('AJJ')).toBe(false);
      expect(isDayOffCode('VIAJ')).toBe(false);
    });

    it('maneja valores nulos, vacíos o indefinidos de forma segura', () => {
      expect(isDayOffCode('')).toBe(false);
      expect(isDayOffCode('   ')).toBe(false);
      expect(isDayOffCode(null)).toBe(false);
      expect(isDayOffCode(undefined)).toBe(false);
    });

    it('AJ no está en IGNORED_EXPLICIT_SHIFT_CODES', () => {
      expect(isExplicitlyIgnoredCode('AJ')).toBe(false);
      expect(isExplicitlyIgnoredCode('aj')).toBe(false);
      expect(isExplicitlyIgnoredCode('AJ [2]')).toBe(false);
    });
  });

  describe('2. Equivalencia funcional exacta: AJ → Día libre y DL → Día libre', () => {
    it('ambos códigos coinciden como tokens de día libre', () => {
      expect(isDayOffCode('AJ')).toBe(true);
      expect(isDayOffCode('DL')).toBe(true);
      expect(isDayOffCode('aj')).toBe(true);
      expect(isDayOffCode('dl')).toBe(true);
    });

    it('ambos resuelven al mismo tipo canónico interno "Libre" con el preset empresarial cargado', () => {
      mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
      expect(resolveShiftTypeId('AJ')).toBe('Libre');
      expect(resolveShiftTypeId('DL')).toBe('Libre');
      expect(resolveShiftTypeId('aj')).toBe('Libre');
      expect(resolveShiftTypeId('dl')).toBe('Libre');
      expect(resolveShiftTypeId('  AJ  ')).toBe('Libre');
      expect(resolveShiftTypeId('  DL  ')).toBe('Libre');
    });

    it('no crea un tipo de turno separado llamado "AJ"', () => {
      const defAj = getShiftTypeDefinition('AJ');
      expect(defAj).toBeUndefined();

      const defLibre = getShiftTypeDefinition('Libre');
      expect(defLibre).toBeDefined();
      expect(defLibre?.id).toBe('Libre');
      expect(defLibre?.countsAsWork).toBe(false);
    });

    it('ambos comparten el mismo color canónico del registro de tipos de turno', () => {
      mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
      const colorAj = getShiftTypeColor('AJ');
      const colorDl = getShiftTypeColor('DL');
      const colorLibre = getShiftTypeColor('Libre');

      expect(colorAj).toBe(colorLibre);
      expect(colorDl).toBe(colorLibre);
    });
  });

  describe('3. Presentación e internacionalización (Día libre / Day off)', () => {
    it('traduce el tipo canónico "Libre" a "Día libre" en español', () => {
      expect(translateShiftTypeLabel('Libre', 'es', 'Libre')).toBe('Día libre');
      expect(translateShiftTypeLabel('Día libre', 'es', 'Día libre')).toBe('Día libre');
      expect(translateShiftTypeLabel('Dia libre', 'es', 'Dia libre')).toBe('Día libre');
    });

    it('traduce el tipo canónico "Libre" a "Day off" en inglés', () => {
      expect(translateShiftTypeLabel('Libre', 'en', 'Libre')).toBe('Day off');
      expect(translateShiftTypeLabel('Day off', 'en', 'Day off')).toBe('Day off');
    });
  });

  describe('4. Características del turno resultante (0 horas, sin tiempos, no nocturno)', () => {
    it('construye un turno con shiftType "Libre", startTime "", endTime "", isValid true y 0 horas', () => {
      mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
      const shifts = buildShiftEntriesForDay('2026-08-15', ['AJ']);

      expect(shifts).toHaveLength(1);
      const shift = shifts[0];

      expect(shift.date).toBe('2026-08-15');
      expect(shift.shiftType).toBe('Libre');
      expect(shift.startTime).toBe('');
      expect(shift.endTime).toBe('');
      expect(shift.isValid).toBe(true);

      const durationMinutesVal = shift.startTime && shift.endTime ? durationMinutes(shift.startTime, shift.endTime) : 0;
      expect(durationMinutesVal).toBe(0);
      const isOvernightVal = shift.startTime && shift.endTime ? isOvernight(shift.startTime, shift.endTime) : false;
      expect(isOvernightVal).toBe(false);
    });

    it('produce exactamente el mismo objeto de turno para AJ que para DL', () => {
      mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
      const shiftsAj = buildShiftEntriesForDay('2026-08-15', ['AJ']);
      const shiftsDl = buildShiftEntriesForDay('2026-08-15', ['DL']);

      expect(shiftsAj).toEqual(shiftsDl);
    });

    it('procesa anotaciones al pie de página como "AJ [2]" idénticamente a "AJ"', () => {
      mergeShiftTypeOverrides(SHIFT_TYPE_PRESET_EXAMPLE);
      const tokens = expandShiftTokens('AJ [2]');
      expect(tokens).toEqual(['OFF']);

      const shifts = buildShiftEntriesForDay('2026-08-15', ['AJ [2]']);
      expect(shifts).toHaveLength(1);
      expect(shifts[0].shiftType).toBe('Libre');
    });
  });

  describe('5. Integración con adaptadores estructurados (CSV / XLSX / Tabular)', () => {
    it('normaliza filas estructuradas con rawType "AJ" a shiftType "Libre"', () => {
      const rows = [
        {
          externalEmployeeId: 'EMP-001',
          employeeName: 'Empleado Test',
          date: '2026-09-01',
          startTime: '',
          endTime: '',
          rawType: 'AJ',
        },
        {
          externalEmployeeId: 'EMP-001',
          employeeName: 'Empleado Test',
          date: '2026-09-02',
          startTime: '',
          endTime: '',
          rawType: 'DL',
        },
        {
          externalEmployeeId: 'EMP-001',
          employeeName: 'Empleado Test',
          date: '2026-09-03',
          startTime: '08:00',
          endTime: '16:00',
          rawType: 'Regular',
        },
      ];

      const { employees, diagnostics } = normalizeStructuredRows(rows);
      expect(employees).toHaveLength(1);
      const shifts = employees[0].shifts;

      expect(shifts).toHaveLength(3);
      expect(shifts[0]).toMatchObject({
        date: '2026-09-01',
        shiftType: 'Libre',
        startTime: '',
        endTime: '',
        isValid: true,
      });
      expect(shifts[1]).toMatchObject({
        date: '2026-09-02',
        shiftType: 'Libre',
        startTime: '',
        endTime: '',
        isValid: true,
      });
      expect(shifts[0].shiftType).toBe(shifts[1].shiftType);
      expect(diagnostics.filter((d) => d.code === 'UNKNOWN_SHIFT_CODES')).toHaveLength(0);
    });

    it('procesa libros XLSX posicionales reconociendo celdas AJ como Libre sin advertencias de código desconocido', async () => {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Calendario empleado" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

      const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

      const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

      // Positional sheet: Row 1 = Employee Name, Row 2 = days 1, 2, 3, Row 3 = "Septiembre", cell B3="AJ", cell C3="DL", cell D3="08:00 16:00"
      const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>Test Employee Calendario 2026</t></is></c></row>
    <row r="2">
      <c r="A2" t="inlineStr"><is><t>Mes</t></is></c>
      <c r="B2"><v>1</v></c>
      <c r="C2"><v>2</v></c>
      <c r="D2"><v>3</v></c>
    </row>
    <row r="3">
      <c r="A3" t="inlineStr"><is><t>Septiembre</t></is></c>
      <c r="B3" t="inlineStr"><is><t>AJ</t></is></c>
      <c r="C3" t="inlineStr"><is><t>DL</t></is></c>
      <c r="D3" t="inlineStr"><is><t>08:00 16:00</t></is></c>
    </row>
  </sheetData>
</worksheet>`;

      zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`);
      zip.file('_rels/.rels', rootRelsXml);
      zip.file('xl/workbook.xml', workbookXml);
      zip.file('xl/_rels/workbook.xml.rels', relsXml);
      zip.file('xl/worksheets/sheet1.xml', sheetXml);

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const file = new File([new Uint8Array(buffer)], 'test-aj.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      const parsed = await parseXlsxTeamWorkbook(file);
      expect(parsed.employees).toHaveLength(1);
      const empShifts = parsed.employees[0].shifts;

      const ajShift = empShifts.find((s) => s.date === '2026-09-01');
      const dlShift = empShifts.find((s) => s.date === '2026-09-02');
      const workShift = empShifts.find((s) => s.date === '2026-09-03');

      expect(ajShift).toBeDefined();
      expect(ajShift).toMatchObject({
        shiftType: 'Libre',
        startTime: '',
        endTime: '',
        isValid: true,
      });

      expect(dlShift).toBeDefined();
      expect(dlShift).toMatchObject({
        shiftType: 'Libre',
        startTime: '',
        endTime: '',
        isValid: true,
      });

      expect(workShift).toBeDefined();
      expect(workShift).toMatchObject({
        shiftType: 'Regular',
        startTime: '08:00',
        endTime: '16:00',
        isValid: true,
      });

      expect(parsed.unresolvedTokens).not.toContain('AJ');
      expect(parsed.unresolvedTokens).not.toContain('DL');
    });
  });
});
