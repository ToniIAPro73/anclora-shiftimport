import { Shift } from './types';

const STORAGE_KEY = 'anclora_shifts_v1';
const SHIFTS_API_URL = '/api/shifts';
// Local-first: remote sync stays disabled (dev and prod) unless explicitly
// enabled, until authenticated sync with per-user isolation exists.
const REMOTE_STORAGE_ENABLED = import.meta.env.VITE_ENABLE_REMOTE_STORAGE === 'true';

export const normalizeShiftDate = (value: string): string => {
  const trimmed = value.trim();
  const match = trimmed.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) {
    return trimmed;
  }

  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

export const normalizeShift = (shift: Shift): Shift => ({
  ...shift,
  date: normalizeShiftDate(shift.date),
  startTime: shift.startTime.trim(),
  endTime: shift.endTime.trim(),
  location: shift.location.trim(),
  // Legacy 'PDF' origin (persisted by the old importer) normalizes to the
  // generic import origin; the file format lives in sourceFormat.
  origin: shift.origin === 'MAN' ? 'MAN' : 'IMP',
});

const writeLocalShifts = (shifts: Shift[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shifts.map(normalizeShift)));
};

const loadLocalShifts = (): Shift[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return [];
  try {
    const shifts = (JSON.parse(data) as Shift[]).map(normalizeShift);
    writeLocalShifts(shifts);
    return shifts;
  } catch (e) {
    console.error('Failed to parse shifts from storage', e);
    return [];
  }
};

/** Raw local copy read, used by the one-shot local→remote migration (Fase 1).
 * The local copy is never deleted by the migration. */
export const loadLocalShiftsForMigration = (): Shift[] => loadLocalShifts();

async function readApiShifts(): Promise<Shift[]> {
  const response = await fetch(SHIFTS_API_URL, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`GET ${SHIFTS_API_URL} failed with ${response.status}`);
  }

  const payload = (await response.json()) as { shifts?: Shift[] };
  if (!Array.isArray(payload.shifts)) {
    throw new Error('Invalid shifts payload from API');
  }

  return payload.shifts.map(normalizeShift);
}

async function patchApiShifts(upserts: Shift[], deleteIds: string[]): Promise<void> {
  const response = await fetch(SHIFTS_API_URL, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      upserts: upserts.map(normalizeShift),
      deleteIds,
    }),
  });

  if (!response.ok) {
    throw new Error(`PATCH ${SHIFTS_API_URL} failed with ${response.status}`);
  }
}

export const syncShiftChanges = async (
  nextShifts: Shift[],
  changes: {
    upserts?: Shift[];
    deleteIds?: string[];
  },
): Promise<void> => {
  const normalizedNext = nextShifts.map(normalizeShift);
  const normalizedUpserts = (changes.upserts ?? []).map(normalizeShift);
  const deleteIds = [...new Set((changes.deleteIds ?? []).map((value) => String(value).trim()).filter(Boolean))];

  if (!REMOTE_STORAGE_ENABLED) {
    writeLocalShifts(normalizedNext);
    return;
  }

  await patchApiShifts(normalizedUpserts, deleteIds);
  writeLocalShifts(normalizedNext);
};

export const loadShifts = async (): Promise<Shift[]> => {
  const localShifts = loadLocalShifts();

  if (!REMOTE_STORAGE_ENABLED) {
    return localShifts;
  }

  try {
    const remoteShifts = await readApiShifts();
    if (remoteShifts.length === 0 && localShifts.length > 0) {
      return localShifts;
    }

    writeLocalShifts(remoteShifts);
    return remoteShifts;
  } catch (error) {
    console.error('Failed to load shifts from API, using local cache', error);
    return localShifts;
  }
};
