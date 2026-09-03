import { describe, expect, it } from 'vitest';
import { findEmployeeRowItems } from './row-detection';
import { TYPE_B_PROFILE } from '../profiles/type-b';
import { PdfTextItem } from './text-items';

/**
 * Regression: a real TYPE_B export variant widened the id/name columns
 * (id at x~110 instead of x~28, name at x~162 instead of x~90) enough that
 * the id marker missed the old markerMaxX bound entirely, and — once that
 * bound was widened to compensate — the employee's own name label leaked
 * past dataMinX into what row-detection treats as shift-cell data. Both
 * symptoms are reproduced here with synthetic coordinates (no real
 * schedule/PII) at the same order of magnitude as the real document.
 */
const rules = TYPE_B_PROFILE.rowWindow;

function widenedRowItems(): PdfTextItem[] {
  return [
    { text: 'SUPERVISOR', x: 60, y: 500, width: 0, height: 0, page: 1 },
    { text: '38248', x: 110, y: 450, width: 0, height: 0, page: 1 },
    { text: 'Ejemplo Apellido, Nombre', x: 162, y: 450, width: 0, height: 0, page: 1 },
    { text: 'DL', x: 300, y: 450, width: 0, height: 0, page: 1 },
    { text: 'AJ', x: 350, y: 450, width: 0, height: 0, page: 1 },
    { text: '10001', x: 60, y: 300, width: 0, height: 0, page: 1 },
  ];
}

describe('findEmployeeRowItems — widened-column TYPE_B export variant', () => {
  it('finds the row when the id marker sits past the narrow-layout bound', () => {
    const row = findEmployeeRowItems(
      widenedRowItems(),
      { employeeName: 'Ejemplo Apellido, Nombre', employeeIdentifiers: ['38248'] },
      rules,
    );
    expect(row).not.toBeNull();
    expect(row!.rowItems.map((item) => item.text)).toEqual(expect.arrayContaining(['DL', 'AJ']));
  });

  it('never treats the employee\'s own name label as row data', () => {
    const row = findEmployeeRowItems(
      widenedRowItems(),
      { employeeName: 'Ejemplo Apellido, Nombre', employeeIdentifiers: ['38248'] },
      rules,
    );
    expect(row).not.toBeNull();
    expect(row!.rowItems.some((item) => item.text === 'Ejemplo Apellido, Nombre')).toBe(false);
  });
});
