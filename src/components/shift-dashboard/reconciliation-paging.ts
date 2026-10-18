export const RECONCILIATION_PAGE_SIZE = 4;

/** Rows per page that fit the window without an outer scroll (each row is ~80px; the rest of the modal ~270px). */
export function reconciliationPageSize(viewportHeight?: number): number {
  if (!viewportHeight || viewportHeight >= 720) return RECONCILIATION_PAGE_SIZE;
  return viewportHeight >= 580 ? 3 : 2;
}

/** 1 … 4 5 6 … 9: stable, compact page list. */
export function pageWindow(current: number, total: number): Array<number | 'gap'> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const result: Array<number | 'gap'> = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) result.push('gap');
    result.push(page);
  });
  return result;
}
