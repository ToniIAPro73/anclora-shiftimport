import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { detectTeamRoster } from './team-roster';

const CSV = `external_employee_id,employee_name,date,start_time,end_time,status,source
SI001,Adriana Molina,2026-09-01,,,DL,SYNTHETIC
SI001,Adriana Molina,2026-09-02,05:00,13:00,WORK,SYNTHETIC
SI002,Bruno Serra,2026-09-01,08:00,16:00,WORK,SYNTHETIC
,Carla Nueva,2026-09-01,09:00,17:00,WORK,SYNTHETIC`;

describe('detectTeamRoster', () => {
  it('returns null for non-tabular text', () => {
    expect(detectTeamRoster('not a csv at all')).toBeNull();
  });

  it('returns null when required columns (employee/date) are missing', () => {
    expect(detectTeamRoster('a,b\n1,2')).toBeNull();
  });

  it('groups rows by external id into distinct employees', () => {
    const result = detectTeamRoster(CSV);
    expect(result).not.toBeNull();
    expect(result?.employees).toHaveLength(3);
    const adriana = result?.employees.find((e) => e.externalEmployeeId === 'SI001');
    expect(adriana?.name).toBe('Adriana Molina');
    expect(adriana?.shifts).toHaveLength(2);
  });

  it('falls back to a normalized-name key when external id is blank', () => {
    const result = detectTeamRoster(CSV);
    const carla = result?.employees.find((e) => e.name === 'Carla Nueva');
    expect(carla?.externalEmployeeId).toBe('');
    expect(carla?.key).toBe('name:carla nueva');
  });

  it('infers Regular for rows with both times, Libre otherwise (DL)', () => {
    const result = detectTeamRoster(CSV);
    const adriana = result?.employees.find((e) => e.externalEmployeeId === 'SI001');
    const dl = adriana?.shifts.find((s) => s.date === '2026-09-01');
    const work = adriana?.shifts.find((s) => s.date === '2026-09-02');
    expect(dl).toMatchObject({ shiftType: 'Libre', startTime: '', endTime: '' });
    expect(work).toMatchObject({ shiftType: 'Regular', startTime: '05:00', endTime: '13:00' });
  });

  it('skips rows with no employee name or an unparseable date', () => {
    const result = detectTeamRoster(
      'external_employee_id,employee_name,date,start_time,end_time\nSI001,,2026-09-01,08:00,16:00\nSI002,Name,not-a-date,08:00,16:00',
    );
    expect(result).toBeNull();
  });

  it('parses the real reference dataset (40 pre-existing + 2 new employees)', () => {
    const path = fileURLToPath(
      new URL('../../test-data/fixtures/parser-regression/04_turnos_septiembre_2026.csv', import.meta.url),
    );
    const text = readFileSync(path, 'utf8');
    const result = detectTeamRoster(text);
    expect(result).not.toBeNull();
    expect(result?.employees.length).toBeGreaterThanOrEqual(42);
    const newHire = result?.employees.find((e) => e.externalEmployeeId === 'SI129901');
    expect(newHire?.name).toBe('Mario Riera López');
    expect((newHire?.shifts.length ?? 0)).toBeGreaterThan(0);
  });
});
