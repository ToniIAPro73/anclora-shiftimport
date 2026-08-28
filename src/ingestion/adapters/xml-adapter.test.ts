// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IngestionError } from '../../lib/ingestion-errors';
import { parseXmlTeamRoster } from './xml-adapter';

const SHIFT = (overrides = '') => `
  <shift>
    <employeeId>OPE-001</employeeId>
    <employeeName>Ana García</employeeName>
    <date>2026-09-01</date>
    <shiftType>M</shiftType>
    <startTime>06:00</startTime>
    <endTime>14:00</endTime>
    ${overrides}
  </shift>`;

describe('parseXmlTeamRoster', () => {
  it('X1: root + <shifts> collection', () => {
    const xml = `<schedule><shifts>${SHIFT()}</shifts></schedule>`;
    const result = parseXmlTeamRoster(xml);
    expect(result.employees).toHaveLength(1);
    expect(result.employees[0]).toMatchObject({ externalEmployeeId: 'OPE-001', name: 'Ana García' });
  });

  it('X2: <shifts> as the document root', () => {
    const xml = `<shifts>${SHIFT()}</shifts>`;
    const result = parseXmlTeamRoster(xml);
    expect(result.employees).toHaveLength(1);
  });

  it('X3: metadata (organization/areaName/period) propagates areaName to rows missing one', () => {
    const xml = `<schedule>
      <organization>Anclora Group</organization>
      <areaName>Operaciones</areaName>
      <period><from>2026-09-01</from><to>2026-09-15</to></period>
      <shifts>${SHIFT()}</shifts>
    </schedule>`;
    const result = parseXmlTeamRoster(xml);
    expect(result.areaName).toBe('Operaciones');
    expect(result.employees[0].areaName).toBe('Operaciones');
  });

  it('X4: an element missing employee/date produces a per-record diagnostic, not a thrown error', () => {
    const xml = `<shifts>${SHIFT()}<shift><date>2026-09-02</date><startTime>06:00</startTime><endTime>14:00</endTime></shift></shifts>`;
    const result = parseXmlTeamRoster(xml);
    expect(result.employees).toHaveLength(1);
    expect(result.diagnostics.some((d) => d.code === 'INSUFFICIENT_DATA')).toBe(true);
  });

  it('X5: malformed XML raises a controlled INVALID_XML error', () => {
    try {
      parseXmlTeamRoster('<schedule><shifts><shift></schedule>');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(IngestionError);
      expect((err as IngestionError).code).toBe('INVALID_XML');
    }
  });

  it('rejects a document with no <shifts> collection', () => {
    try {
      parseXmlTeamRoster('<root><nothing/></root>');
      expect.unreachable();
    } catch (err) {
      expect((err as IngestionError).code).toBe('UNKNOWN_STRUCTURED_SCHEMA');
    }
  });

  it('never resolves an external entity (no XXE surface)', () => {
    const xml = `<?xml version="1.0"?>
<!DOCTYPE schedule [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<schedule><shifts>
  <shift>
    <employeeId>OPE-001</employeeId>
    <employeeName>&xxe;</employeeName>
    <date>2026-09-01</date>
    <startTime>06:00</startTime>
    <endTime>14:00</endTime>
  </shift>
</shifts></schedule>`;
    // Either the parser refuses the external entity outright (INVALID_XML) or
    // it produces a value that is never actual file content — both are safe;
    // what must never happen is /etc/passwd content ending up in the result.
    try {
      const result = parseXmlTeamRoster(xml);
      const name = result.employees[0]?.name ?? '';
      expect(name).not.toContain('root:');
    } catch (err) {
      expect(err).toBeInstanceOf(IngestionError);
    }
  });

  it('detects the deliberate incidents in the acceptance fixture', () => {
    const path = resolve(process.cwd(), 'test-data/scenarios/anclora-group-shift-ingestion/06_turnos_operaciones_2026-09_01-15.xml');
    const text = readFileSync(path, 'utf8');
    const result = parseXmlTeamRoster(text);

    expect(result.diagnostics.some((d) => d.code === 'INVALID_DATE')).toBe(true);
    const ope001 = result.employees.find((e) => e.externalEmployeeId === 'OPE-001');
    expect(ope001?.shifts.some((s) => s.date === '2026-09-16')).toBe(true);
  });
});
