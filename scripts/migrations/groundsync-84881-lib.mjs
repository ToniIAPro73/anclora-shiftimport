import { createHash } from 'node:crypto';

export const EMPLOYEE_EXTERNAL_ID = '84881';
export const SOURCE_APP = 'anclora-groundsync';
export const OPERATIONAL_DATE = process.env.MIGRATION_OPERATIONAL_DATE || '2026-10-12';

const TYPE_SEMANTICS = Object.freeze({
  Regular: { countsAsWork: true, timed: true },
  JT: { countsAsWork: true, timed: true },
  Extras: { countsAsWork: true, timed: true },
  Libre: { countsAsWork: false, timed: false },
  Vacaciones: { countsAsWork: false, timed: false },
});

export function mapSourceRow(row) {
  const semantics = TYPE_SEMANTICS[row.location];
  const startTime = String(row.start_time ?? '').trim();
  const endTime = String(row.end_time ?? '').trim();
  const reasons = [];
  if (!semantics) reasons.push('UNKNOWN_TYPE');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || Number(row.date.slice(0, 4)) < 1900) reasons.push('INVALID_DATE');
  if (semantics?.timed && (!startTime || !endTime)) reasons.push('MISSING_TIME');
  if (semantics && !semantics.timed && (startTime || endTime)) reasons.push('UNEXPECTED_TIME');
  return {
    sourceId: row.id,
    date: row.date,
    startTime: semantics?.timed ? startTime : null,
    endTime: semantics?.timed ? endTime : null,
    location: row.location,
    origin: row.origin,
    shiftType: row.location,
    countsAsWork: semantics?.countsAsWork ?? false,
    reasons,
  };
}

export function identityKey(row) {
  return [row.date, row.shiftType, row.startTime ?? '', row.endTime ?? '', row.countsAsWork ? '1' : '0'].join('|');
}

export function classifyRows(sourceRows, existingRows) {
  const mapped = sourceRows.map(mapSourceRow);
  const existingKeys = new Set(existingRows.map(identityKey));
  const existingDates = new Set(existingRows.map((row) => row.date));
  const seen = new Set();
  const result = { historical: [], future: [], duplicate: [], conflict: [], invalid: [] };
  for (const row of mapped) {
    if (row.reasons.length) {
      result.invalid.push(row);
      continue;
    }
    const key = identityKey(row);
    if (seen.has(key) || existingKeys.has(key)) {
      result.duplicate.push(row);
    } else if (existingDates.has(row.date)) {
      result.conflict.push(row);
    } else if (row.date < OPERATIONAL_DATE) {
      result.historical.push(row);
    } else {
      result.future.push(row);
    }
    seen.add(key);
  }
  return result;
}

export function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function weekStart(date) {
  const value = new Date(`${date}T00:00:00Z`);
  const day = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() - (day === 0 ? 6 : day - 1));
  return value.toISOString().slice(0, 10);
}

export function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function migrationFingerprint(sourceRows) {
  return fingerprint({ sourceApp: SOURCE_APP, employeeExternalId: EMPLOYEE_EXTERNAL_ID, rows: sourceRows });
}
