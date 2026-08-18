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
import { ShiftCodeMapping } from './shift-code-profile';
import { expandShiftTokens, isOffToken } from './tokens';

function buildLibreShift(date: string, rawText: string): ParsedCalendarShift {
  return {
    date,
    startTime: '',
    endTime: '',
    origin: 'IMP',
    isValid: true,
    confidence: 1.0,
    rawText,
    shiftType: 'Libre',
    notes: null,
    color: 'red',
  };
}

export function buildShiftEntriesForDay(
  date: string,
  tokens: string[],
  codeProfile?: Map<string, ShiftCodeMapping>,
): ParsedCalendarShift[] {
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
