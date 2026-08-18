/**
 * Declarative shift-code profile: maps a raw source code (e.g. `M`, `T`,
 * `N`, `L`, or a document-specific code like `G`/`GN`) onto concrete shift
 * semantics (start/end time, work vs free).
 *
 * DEFAULT_CODE_PROFILE covers the generic industry-neutral morning/
 * afternoon/night/free convention (M/T/N/L) — not any one company's
 * scheme. Documents that carry their own legend (e.g. "M 07:00-15:00;
 * G 08:00-20:00") override/extend the defaults per-document via
 * parseLegendCodes, so company-specific codes never need to be hardcoded
 * into the product.
 */
import { PdfTextItem } from './text-items';

export interface ShiftCodeMapping {
  code: string;
  startTime: string | null;
  endTime: string | null;
  status: 'work' | 'free';
}

export const DEFAULT_CODE_PROFILE: ShiftCodeMapping[] = [
  { code: 'M', startTime: '07:00', endTime: '15:00', status: 'work' },
  { code: 'T', startTime: '15:00', endTime: '23:00', status: 'work' },
  { code: 'N', startTime: '23:00', endTime: '07:00', status: 'work' },
  { code: 'L', startTime: null, endTime: null, status: 'free' },
];

const LEGEND_ENTRY_PATTERN = /\b([A-Za-zÁÉÍÓÚÑáéíóúñ]{1,4})\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g;

/** Extracts `CODE HH:MM-HH:MM` entries from a document legend line. */
export function parseLegendCodes(text: string): ShiftCodeMapping[] {
  const entries: ShiftCodeMapping[] = [];
  for (const match of text.matchAll(LEGEND_ENTRY_PATTERN)) {
    const [, code, startH, startM, endH, endM] = match;
    entries.push({
      code: code.toUpperCase(),
      startTime: `${startH.padStart(2, '0')}:${startM}`,
      endTime: `${endH.padStart(2, '0')}:${endM}`,
      status: 'work',
    });
  }
  return entries;
}

/**
 * Builds the effective code profile for a document: generic defaults
 * merged with any legend found in the document text (legend entries win).
 */
export function buildCodeProfile(items: PdfTextItem[]): Map<string, ShiftCodeMapping> {
  const map = new Map<string, ShiftCodeMapping>();
  for (const entry of DEFAULT_CODE_PROFILE) {
    map.set(entry.code, entry);
  }
  for (const item of items) {
    for (const entry of parseLegendCodes(item.text)) {
      map.set(entry.code, entry);
    }
  }
  return map;
}

export function resolveCode(token: string, profile: Map<string, ShiftCodeMapping>): ShiftCodeMapping | null {
  const normalized = token.trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  return profile.get(normalized) ?? null;
}
