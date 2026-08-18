/**
 * X-position clustering and column→day alignment.
 *
 * Both heuristics are parameterized: each ingestion profile declares its own
 * tolerances (see ingestion/profiles/).
 */
import { PdfTextItem } from './text-items';

/**
 * Groups items by x position: an item joins the previous group when its x is
 * within `tolerance` of the group's running center, otherwise it starts a
 * new group.
 */
export function clusterByX(items: PdfTextItem[], tolerance: number): PdfTextItem[][] {
  const sorted = [...items].sort((left, right) => left.x - right.x);
  const groups: PdfTextItem[][] = [];

  for (const item of sorted) {
    const lastGroup = groups[groups.length - 1];
    if (!lastGroup) {
      groups.push([item]);
      continue;
    }

    const center = lastGroup.reduce((sum, current) => sum + current.x, 0) / lastGroup.length;
    if (Math.abs(item.x - center) <= tolerance) {
      lastGroup.push(item);
    } else {
      groups.push([item]);
    }
  }

  return groups;
}

export interface DayColumn {
  day: number;
  x: number;
}

export interface ColumnDayMapping {
  /** Pairs actually aligned, ordered by day. */
  mapped: Array<{ day: number; groupIndex: number; items: PdfTextItem[] }>;
  /** Indices into `columnGroups` that could not be aligned to any day column. */
  unmatchedGroupIndices: number[];
}

/**
 * Assigns each cluster to the nearest unused day column, provided the
 * distance is within `maxDistance`. Unlike mapColumnGroupsToDays it also
 * reports which groups stayed unmatched, so the analysis layer can surface
 * the alignment gap without recomputing it.
 */
export function mapColumnGroupsToDaysDetailed(
  columnGroups: PdfTextItem[][],
  dayColumns: DayColumn[],
  maxDistance: number,
): ColumnDayMapping {
  const usedDays = new Set<number>();
  const mapped: Array<{ day: number; groupIndex: number; items: PdfTextItem[] }> = [];
  const unmatchedGroupIndices: number[] = [];

  columnGroups.forEach((group, groupIndex) => {
    const centerX = group.reduce((sum, item) => sum + item.x, 0) / group.length;
    let bestMatch: DayColumn | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const dayColumn of dayColumns) {
      if (usedDays.has(dayColumn.day)) {
        continue;
      }

      const distance = Math.abs(dayColumn.x - centerX);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = dayColumn;
      }
    }

    if (!bestMatch || bestDistance > maxDistance) {
      unmatchedGroupIndices.push(groupIndex);
      return;
    }

    usedDays.add(bestMatch.day);
    mapped.push({ day: bestMatch.day, groupIndex, items: group });
  });

  mapped.sort((left, right) => left.day - right.day);
  return { mapped, unmatchedGroupIndices };
}

/**
 * Assigns each cluster to the nearest unused day column, provided the
 * distance is within `maxDistance`. Result is ordered by day.
 */
export function mapColumnGroupsToDays(
  columnGroups: PdfTextItem[][],
  dayColumns: DayColumn[],
  maxDistance: number,
): Array<{ day: number; items: PdfTextItem[] }> {
  return mapColumnGroupsToDaysDetailed(columnGroups, dayColumns, maxDistance)
    .mapped
    .map(({ day, items }) => ({ day, items }));
}
