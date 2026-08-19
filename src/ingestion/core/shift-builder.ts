/**
 * Shift construction: turns the ordered token stream of one day cell into
 * normalized ParsedCalendarShift entries.
 *
 * Rules:
 * - A cell whose tokens are all "off" (Libre) produces one Libre shift with
 *   no times.
 * - Otherwise `--` splits the cell into segments (split shifts); each pair
 *   of times in a segment becomes one Regular shift. Odd trailing times
 *   produce an incomplete `??:??` entry flagged as invalid.
 */
import { ParsedCalendarShift } from '../../lib/import-types';
import { isTimeToken, normalizeTimeToken } from './normalize';
import { resolveCode, ShiftCodeMapping } from './shift-code-profile';
import { expandShiftTokens, isOffToken } from './tokens';

function buildAbsenceShift(date: string, rawText: string, shiftTypeId: string): ParsedCalendarShift {
  return {
    date,
    startTime: '',
    endTime: '',
    origin: 'IMP',
    isValid: true,
    confidence: 1.0,
    rawText,
    shiftType: shiftTypeId,
    notes: null,
    // Libre keeps its historical red; other absence types resolve their
    // color from the shift-type registry at render time.
    color: shiftTypeId === 'Libre' ? 'red' : null,
  };
}

function buildLibreShift(date: string, rawText: string): ParsedCalendarShift {
  return buildAbsenceShift(date, rawText, 'Libre');
}

/**
 * A single-token cell that resolves through the code profile maps directly
 * onto the mapping's semantics: free → absence shift of the mapped type
 * (Libre by default, e.g. Vacaciones when the user taught it), work → timed
 * shift of the mapped type (Regular by default). Learned codes carry
 * shiftTypeId; defaults/legends omit it and keep the legacy outcome.
 */
function buildFromSingleCode(
  date: string,
  tokens: string[],
  codeProfile: Map<string, ShiftCodeMapping>,
): ParsedCalendarShift[] | null {
  if (tokens.length !== 1) {
    return null;
  }
  const mapped = resolveCode(tokens[0], codeProfile);
  if (!mapped) {
    return null;
  }
  if (mapped.status === 'free') {
    return [buildAbsenceShift(date, tokens[0], mapped.shiftTypeId ?? 'Libre')];
  }
  if (!mapped.startTime || !mapped.endTime) {
    return null;
  }
  return [{
    date,
    startTime: mapped.startTime,
    endTime: mapped.endTime,
    origin: 'IMP',
    isValid: true,
    confidence: 0.9,
    rawText: tokens[0],
    shiftType: mapped.shiftTypeId ?? 'Regular',
    notes: null,
    color: mapped.shiftTypeId ? null : 'blue',
  }];
}

export function buildShiftEntriesForDay(
  date: string,
  tokens: string[],
  codeProfile?: Map<string, ShiftCodeMapping>,
): ParsedCalendarShift[] {
  if (codeProfile) {
    const fromCode = buildFromSingleCode(date, tokens, codeProfile);
    if (fromCode) {
      return fromCode;
    }
  }

  const meaningful = tokens.flatMap((token) => expandShiftTokens(token, codeProfile)).map((token) => token.trim()).filter(Boolean);
  if (meaningful.length === 0) {
    return [];
  }

  if (meaningful.every(isOffToken)) {
    return [buildLibreShift(date, meaningful.join(' '))];
  }

  const shifts: ParsedCalendarShift[] = [];
  const segments: string[][] = [];
  let currentSegment: string[] = [];

  for (const token of meaningful) {
    if (token === '--') {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
      continue;
    }
    currentSegment.push(token);
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  const effectiveSegments = segments.length > 0 ? segments : [meaningful];
  for (const segment of effectiveSegments) {
    if (segment.every(isOffToken)) {
      shifts.push(buildLibreShift(date, segment.join(' ')));
      continue;
    }

    const times = segment.filter(isTimeToken).map(normalizeTimeToken);
    for (let index = 0; index < times.length; index += 2) {
      const startTime = times[index] ?? '??:??';
      const endTime = times[index + 1] ?? '??:??';
      shifts.push({
        date,
        startTime,
        endTime,
        origin: 'IMP',
        isValid: startTime !== '??:??' && endTime !== '??:??',
        confidence: 0.9,
        rawText: segment.join(' '),
        shiftType: 'Regular', // Always Regular for work shifts
        notes: null,
        color: 'blue',
      });
    }
  }

  return shifts;
}
