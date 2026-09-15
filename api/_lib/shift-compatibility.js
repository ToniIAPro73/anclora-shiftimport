/**
 * Authoritative server-side compatibility semantics. The persisted database
 * keeps the existing shape (shift_type, counts_as_work and nullable times);
 * these domain properties are derived from the canonical type and interval.
 */
const ABSENCE_TYPES = new Set(['ausencia', 'ausencias', 'absence', 'absences']);
const FULL_DAY_TYPES = new Set(['libre', 'día libre', 'dia libre', 'day off', 'off', 'vacaciones', 'baja', 'leave', 'sick leave']);

export function canonicalShiftType(value) {
  const type = String(value ?? '').trim();
  const normalized = type.toLowerCase();
  if (ABSENCE_TYPES.has(normalized)) return 'Ausencia';
  if (normalized === 'día libre' || normalized === 'dia libre' || normalized === 'day off' || normalized === 'off') return 'Libre';
  if (normalized === 'vac' || normalized === 'vac.') return 'Vacaciones';
  return type || 'Regular';
}

export function getShiftSemantics({ shiftType, countsAsWork, startTime, endTime } = {}) {
  const input = arguments[0] ?? {};
  const resolvedType = shiftType ?? input.shift_type;
  const resolvedCountsAsWork = countsAsWork ?? input.counts_as_work;
  const resolvedStartTime = startTime ?? input.start_time;
  const resolvedEndTime = endTime ?? input.end_time;
  const type = canonicalShiftType(resolvedType);
  const normalized = type.toLowerCase();
  const hasTimes = Boolean(resolvedStartTime && resolvedEndTime);
  const isAbsence = ABSENCE_TYPES.has(normalized);
  const allDay = FULL_DAY_TYPES.has(normalized) || (!hasTimes && !isAbsence && resolvedCountsAsWork === false);
  const timed = isAbsence || hasTimes || resolvedCountsAsWork === true;
  return {
    type,
    timed,
    allDay,
    exclusive: allDay,
    contributesWorkedTime: resolvedCountsAsWork !== false && !isAbsence && !FULL_DAY_TYPES.has(normalized),
    contributesAbsenceTime: isAbsence,
  };
}

export function rangesOverlap(startTime, endTime, existingStartTime, existingEndTime) {
  const toMinutes = (value) => {
    const [hours, minutes] = String(value).slice(0, 5).split(':').map(Number);
    return hours * 60 + minutes;
  };
  const start = toMinutes(startTime);
  const endBase = toMinutes(endTime);
  const end = endBase <= start ? endBase + 1440 : endBase;
  const existingStart = toMinutes(existingStartTime);
  const existingEndBase = toMinutes(existingEndTime);
  const existingEnd = existingEndBase <= existingStart ? existingEndBase + 1440 : existingEndBase;
  return start < existingEnd && existingStart < end;
}

export function findAssignmentConflict(existingRows, incoming, excludeId = null) {
  const incomingSemantics = getShiftSemantics(incoming);
  for (const existing of existingRows) {
    if (excludeId && existing.id === excludeId) continue;
    const existingSemantics = getShiftSemantics(existing);
    if (incomingSemantics.exclusive || existingSemantics.exclusive) {
      return {
        code: 'FULL_DAY_CONFLICT',
        existing,
        incoming: incomingSemantics,
        fullDayType: existingSemantics.exclusive ? existingSemantics.type : incomingSemantics.type,
      };
    }
    if (incomingSemantics.timed && existingSemantics.timed
      && rangesOverlap(
        incoming.startTime ?? incoming.start_time,
        incoming.endTime ?? incoming.end_time,
        existing.startTime ?? existing.start_time,
        existing.endTime ?? existing.end_time,
      )) {
      return { code: 'OVERLAP', existing, incoming: incomingSemantics };
    }
  }
  return null;
}

export function assertTimedTypeHasTimes({ shiftType, countsAsWork, startTime, endTime }) {
  const semantics = getShiftSemantics({ shiftType, countsAsWork, startTime, endTime });
  if (semantics.timed && (!startTime || !endTime)) {
    const error = new Error('Timed shift types require startTime and endTime');
    error.code = 'SHIFT_TIMES_REQUIRED';
    error.status = 400;
    throw error;
  }
}
