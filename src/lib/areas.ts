import { RemoteArea, RemoteEmployee } from './remote';

/**
 * Area helpers (Areas opcionales 0..N por Organization). Pure client-side
 * logic: the server stays authoritative for writes and unknown-area
 * rejections — these helpers only drive early UI validation and context
 * display.
 */

/** Normalized comparison key for area names/codes (trim + lowercase). */
export function normalizeAreaKey(value: string): string {
  return value.trim().toLowerCase();
}

/** Resolves a free-text area reference (CSV column, manual input) against
 * the org's ACTIVE areas, by name or code. Null when unknown. */
export function findActiveArea(areas: RemoteArea[], nameOrCode: string): RemoteArea | null {
  const key = normalizeAreaKey(nameOrCode);
  if (!key) {
    return null;
  }
  return areas.find(
    (area) => area.active && (normalizeAreaKey(area.name) === key || (area.code !== null && normalizeAreaKey(area.code) === key)),
  ) ?? null;
}

export interface AreaMismatch {
  employeeName: string;
  /** Name of the area the employee belongs to (falls back to the raw id
   * when the area is no longer in the org list, e.g. deactivated). */
  employeeAreaName: string;
  targetAreaName: string;
}

/**
 * Area-scoped import guard: when the import targets a concrete area
 * (targetAreaId non-null) and the matched employee belongs to a DIFFERENT
 * area, importing silently would cross area boundaries — the caller must
 * surface this and require an explicit resolution. Org-scoped imports
 * (targetAreaId null) and employees without an area never mismatch.
 */
export function findAreaMismatch(
  employee: Pick<RemoteEmployee, 'name' | 'areaId'>,
  targetAreaId: string | null | undefined,
  areas: RemoteArea[],
): AreaMismatch | null {
  if (!targetAreaId || !employee.areaId || employee.areaId === targetAreaId) {
    return null;
  }
  const areaName = (id: string) => areas.find((area) => area.id === id)?.name ?? id;
  return {
    employeeName: employee.name,
    employeeAreaName: areaName(employee.areaId),
    targetAreaName: areaName(targetAreaId),
  };
}
