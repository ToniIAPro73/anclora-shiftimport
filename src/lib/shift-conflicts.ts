/**
 * Shift conflict rules, extracted from App.tsx so they can be unit tested.
 * A conflict check compares an incoming shift against the existing shifts of
 * the same date and origin, honoring the configurable shift-type registry.
 */
import { getShiftOrigin, getShiftType, hasShiftTimes } from './shifts';
import { normalizeShift } from './storage';
import { parseHHMM } from './time';
import { Shift } from './types';

export function timeRangesOverlap(left: Shift, right: Shift): boolean {
  if (!hasShiftTimes(left) || !hasShiftTimes(right)) {
    return false;
  }

  const leftStart = parseHHMM(left.startTime);
  const leftEnd = parseHHMM(left.endTime) <= leftStart
    ? parseHHMM(left.endTime) + (24 * 60)
    : parseHHMM(left.endTime);
  const rightStart = parseHHMM(right.startTime);
  const rightEnd = parseHHMM(right.endTime) <= rightStart
    ? parseHHMM(right.endTime) + (24 * 60)
    : parseHHMM(right.endTime);

  const intervals: Array<[number, number]> = [
    [leftStart, leftEnd],
    [leftStart + (24 * 60), leftEnd + (24 * 60)],
  ];
  const candidates: Array<[number, number]> = [
    [rightStart, rightEnd],
    [rightStart + (24 * 60), rightEnd + (24 * 60)],
  ];

  return intervals.some(([aStart, aEnd]) =>
    candidates.some(([bStart, bEnd]) => aStart < bEnd && bStart < aEnd));
}

/**
 * Returns a human-readable conflict reason, or null when the incoming shift
 * can be saved alongside the existing ones.
 */
export function findShiftConflict(current: Shift[], incoming: Shift): string | null {
  const normalizedIncoming = normalizeShift(incoming);
  const incomingType = getShiftType(normalizedIncoming);
  const incomingOrigin = getShiftOrigin(normalizedIncoming);
  const comparable = current.filter(
    (shift) =>
      shift.id !== normalizedIncoming.id &&
      shift.date === normalizedIncoming.date &&
      getShiftOrigin(shift) === incomingOrigin,
  );

  const existingVacation = comparable.find((shift) => getShiftType(shift) === 'Vacaciones');
  if (existingVacation && incomingType !== 'Vacaciones') {
    return `No puedes añadir un turno ${incomingType} en ${normalizedIncoming.date} porque ya existe un turno de Vacaciones.`;
  }

  const sameType = comparable.find(
    (shift) => getShiftType(shift) === incomingType && incomingType !== 'Extras',
  );
  if (sameType) {
    return `Ya existe un turno de tipo ${incomingType} en ${normalizedIncoming.date}. Puedes modificar manualmente el turno existente.`;
  }

  if (incomingType === 'Libre') {
    const incompatible = comparable.find((shift) => {
      const existingType = getShiftType(shift);
      return existingType === 'Regular' || existingType === 'JT' || existingType === 'Libre';
    });

    if (incompatible) {
      return `No puedes añadir Libre si ya existe un turno ${getShiftType(incompatible)} en ${normalizedIncoming.date}.`;
    }
  }

  if (incomingType === 'Regular' || incomingType === 'JT') {
    const incompatible = comparable.find((shift) => getShiftType(shift) === 'Libre');

    if (incompatible) {
      return `No puedes combinar ${incomingType} con Libre en ${normalizedIncoming.date}.`;
    }
  }

  if (incomingType === 'Extras' && hasShiftTimes(normalizedIncoming)) {
    const overlapping = comparable.find((shift) => {
      const existingType = getShiftType(shift);
      if (existingType !== 'Regular' && existingType !== 'Extras') {
        return false;
      }

      return hasShiftTimes(shift) && timeRangesOverlap(shift, normalizedIncoming);
    });

    if (overlapping) {
      return `El turno Extras se solapa con el turno ${getShiftType(overlapping)} de ${normalizedIncoming.date}. Corrigelo antes de añadirlo.`;
    }
  }

  return null;
}
