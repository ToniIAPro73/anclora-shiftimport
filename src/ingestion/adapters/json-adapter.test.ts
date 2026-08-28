import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { IngestionError } from '../../lib/ingestion-errors';
import { parseJsonTeamRoster } from './json-adapter';

const BASE_RECORD = {
  employeeName: 'Ana García',
  externalEmployeeId: 'OPE-001',
  areaName: 'Operaciones',
  date: '2026-09-01',
  shiftType: 'M',
  startTime: '06:00',
  endTime: '14:00',
};

describe('parseJsonTeamRoster', () => {
  it('J1: accepts a direct array of records', () => {
    const result = parseJsonTeamRoster(JSON.stringify([BASE_RECORD]));
    expect(result.employees).toHaveLength(1);
    expect(result.employees[0]).toMatchObject({ externalEmployeeId: 'OPE-001', name: 'Ana García', areaName: 'Operaciones' });
  });

  it('J2: accepts { shifts: [...] }', () => {
    const result = parseJsonTeamRoster(JSON.stringify({ shifts: [BASE_RECORD] }));
    expect(result.employees).toHaveLength(1);
  });

  it('J3: accepts metadata + shifts, propagating document areaName to rows missing one', () => {
    const { areaName, ...recordWithoutArea } = BASE_RECORD;
    void areaName;
    const result = parseJsonTeamRoster(JSON.stringify({
      schemaVersion: '1.0',
      organization: 'Anclora Group',
      areaName: 'Operaciones',
      period: { from: '2026-09-01', to: '2026-09-15' },
      shifts: [recordWithoutArea],
    }));
    expect(result.organization).toBe('Anclora Group');
    expect(result.areaName).toBe('Operaciones');
    expect(result.employees[0].areaName).toBe('Operaciones');
  });

  it('rejects syntactically invalid JSON with a controlled error', () => {
    expect(() => parseJsonTeamRoster('{ not json')).toThrow(IngestionError);
    try {
      parseJsonTeamRoster('{ not json');
    } catch (err) {
      expect((err as IngestionError).code).toBe('INVALID_JSON');
    }
  });

  it('rejects a schema with no identifiable record array', () => {
    try {
      parseJsonTeamRoster(JSON.stringify({ hello: 'world' }));
      expect.unreachable();
    } catch (err) {
      expect((err as IngestionError).code).toBe('UNKNOWN_STRUCTURED_SCHEMA');
    }
  });

  it('detects the deliberate incomplete-shift and duplicate incidents in the acceptance fixture', () => {
    const path = fileURLToPath(
      new URL('../../../test-data/scenarios/anclora-group-shift-ingestion/03_turnos_operaciones_2026-09_01-15.json', import.meta.url),
    );
    const text = readFileSync(path, 'utf8');
    const result = parseJsonTeamRoster(text);

    const ope004 = result.employees.find((e) => e.externalEmployeeId === 'OPE-004');
    expect(ope004?.shifts.filter((s) => s.date === '2026-09-06')).toHaveLength(1);
    expect(result.diagnostics.some((d) => d.code === 'DUPLICATE_RECORD' && d.employeeKey === 'OPE-004')).toBe(true);

    const ope011 = result.employees.find((e) => e.externalEmployeeId === 'OPE-011');
    expect(ope011?.shifts.some((s) => s.date === '2026-09-11')).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'INCOMPLETE_SHIFT' && d.employeeKey === 'OPE-011')).toBe(true);

    expect(result.employees.length).toBe(15);
  });
});
