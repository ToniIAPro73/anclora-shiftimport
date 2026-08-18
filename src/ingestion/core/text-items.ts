/**
 * Core text extraction primitives.
 *
 * The parser operates on positioned text items (the shape PDF.js returns,
 * normalized). Keeping this pure-item layer separate from the file loading
 * layer (ingestion/parsers/pdf.ts) allows tests to run on synthetic items
 * without binary PDFs.
 */
export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

/** Raw shape of a PDF.js text content item (only the fields we use). */
export interface RawPdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
}

/**
 * Deduces the calendar year from any `20xx` token found in the items,
 * in the order the items were extracted. Falls back to the current year.
 */
export function deduceYearFromItems(items: PdfTextItem[]): number {
  const yearTokens = items
    .map((item) => item.text.match(/\b(20\d{2})\b/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => Number.parseInt(match[1], 10))
    .filter((year) => year >= 2020 && year <= 2100);

  if (yearTokens.length > 0) {
    return yearTokens[0];
  }

  return new Date().getFullYear();
}

/**
 * Reading order: top to bottom (PDF y grows upward, tolerance 1 unit),
 * then left to right within the same visual line.
 */
export function sortPdfItemsForReading(items: PdfTextItem[]): PdfTextItem[] {
  return [...items].sort((left, right) => {
    if (Math.abs(left.y - right.y) > 1) {
      return right.y - left.y;
    }
    return left.x - right.x;
  });
}
