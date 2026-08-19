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
import { shiftTypeCountsAsWork } from '../../lib/shift-types';
import { PdfTextItem } from './text-items';

export interface ShiftCodeMapping {
  code: string;
  startTime: string | null;
  endTime: string | null;
  status: 'work' | 'free';
  /**
   * Target shift-type id when the mapping was learned from the user (guided
   * recovery). Absent for the generic defaults/legends, which keep the
   * historical Regular/Libre outcome.
   */
  shiftTypeId?: string;
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

/**
 * Code mappings learned through guided recovery (assistant answers or a
 * matched UserFormatProfile): work answers with explicit times become timed
 * work mappings of the chosen type; rest answers (or aliases pointing at a
 * non-work type) become free mappings of that type. Work aliases without
 * times yield nothing — a bare alias cannot fabricate a shift.
 *
 * Structural input type (tokenAliases/offTokens/codeTimes) matches the
 * UserFormatProfile fields without importing the persistence layer.
 */
export function codeOverridesFromLearning(learned: {
  tokenAliases: Record<string, string>;
  offTokens: string[];
  codeTimes?: Record<string, { startTime: string; endTime: string }>;
}): Map<string, ShiftCodeMapping> {
  const overrides = new Map<string, ShiftCodeMapping>();
  const offSet = new Set(learned.offTokens.map((token) => token.trim().toUpperCase()));

  for (const [rawToken, typeId] of Object.entries(learned.tokenAliases)) {
    const code = rawToken.trim().toUpperCase();
    if (!code || !typeId) {
      continue;
    }
    const times = learned.codeTimes?.[rawToken] ?? learned.codeTimes?.[code];
    if (times) {
      overrides.set(code, {
        code,
        startTime: times.startTime,
        endTime: times.endTime,
        status: 'work',
        shiftTypeId: typeId,
      });
      continue;
    }
    if (offSet.has(code) || !shiftTypeCountsAsWork(typeId)) {
      overrides.set(code, { code, startTime: null, endTime: null, status: 'free', shiftTypeId: typeId });
    }
  }

  for (const token of learned.offTokens) {
    const code = token.trim().toUpperCase();
    if (code && !overrides.has(code)) {
      overrides.set(code, { code, startTime: null, endTime: null, status: 'free', shiftTypeId: 'Libre' });
    }
  }

  return overrides;
}
