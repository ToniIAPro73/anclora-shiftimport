/**
 * VLM fallback (server): canonical extraction result schema + hand-rolled
 * validator (no new dependencies). The VLM provider output is NEVER trusted:
 * everything it returns passes through validateVlmExtraction before the
 * endpoint serves it to the client.
 *
 * Shape:
 * {
 *   employeeName: string|null,
 *   externalEmployeeId: string|null,
 *   areaName: string|null,
 *   entries: [{ date: 'YYYY-MM-DD', shiftType: string|null,
 *               startTime: 'HH:mm'|null, endTime: 'HH:mm'|null,
 *               notes: string|null }]
 * }
 */

export const MAX_VLM_ENTRIES = 200;
export const MAX_VLM_STRING = 200;

/** JSON Schema mirror of the validator, for documentation and for providers
 * that support structured outputs. Kept strict (additionalProperties: false,
 * all keys required, nullables explicit) on purpose. */
export const VLM_EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['employeeName', 'externalEmployeeId', 'areaName', 'entries'],
  properties: {
    employeeName: { type: ['string', 'null'], maxLength: MAX_VLM_STRING },
    externalEmployeeId: { type: ['string', 'null'], maxLength: MAX_VLM_STRING },
    areaName: { type: ['string', 'null'], maxLength: MAX_VLM_STRING },
    entries: {
      type: 'array',
      maxItems: MAX_VLM_ENTRIES,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'shiftType', 'startTime', 'endTime', 'notes'],
        properties: {
          date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          shiftType: { type: ['string', 'null'], maxLength: MAX_VLM_STRING },
          startTime: { type: ['string', 'null'], pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
          endTime: { type: ['string', 'null'], pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
          notes: { type: ['string', 'null'], maxLength: MAX_VLM_STRING },
        },
      },
    },
  },
};

const TOP_LEVEL_KEYS = new Set(['employeeName', 'externalEmployeeId', 'areaName', 'entries']);
const ENTRY_KEYS = new Set(['date', 'shiftType', 'startTime', 'endTime', 'notes']);

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const isBoundedNullableString = (value) => value === null
  || (typeof value === 'string' && value.length <= MAX_VLM_STRING);

/** Strict ISO calendar date: 2026-02-30 must NOT pass. */
function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

const isValidTime = (value) => value === null
  || (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value));

const fail = (reason) => ({ ok: false, reason });

/**
 * Pure structural validation of a VLM extraction payload.
 * @returns {{ ok: true, value: object } | { ok: false, reason: string }}
 */
export function validateVlmExtraction(payload) {
  if (!isPlainObject(payload)) {
    return fail('payload is not an object');
  }
  for (const key of Object.keys(payload)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      return fail(`unexpected top-level key: ${key}`);
    }
  }
  for (const field of ['employeeName', 'externalEmployeeId', 'areaName']) {
    if (!isBoundedNullableString(payload[field])) {
      return fail(`${field} must be a string of at most ${MAX_VLM_STRING} chars or null`);
    }
  }
  if (!Array.isArray(payload.entries)) {
    return fail('entries must be an array');
  }
  if (payload.entries.length > MAX_VLM_ENTRIES) {
    return fail(`entries exceeds the maximum of ${MAX_VLM_ENTRIES}`);
  }
  for (let index = 0; index < payload.entries.length; index += 1) {
    const entry = payload.entries[index];
    if (!isPlainObject(entry)) {
      return fail(`entries[${index}] is not an object`);
    }
    for (const key of Object.keys(entry)) {
      if (!ENTRY_KEYS.has(key)) {
        return fail(`entries[${index}] has unexpected key: ${key}`);
      }
    }
    if (!isValidIsoDate(entry.date)) {
      return fail(`entries[${index}].date is not a valid ISO calendar date (YYYY-MM-DD)`);
    }
    if (!isBoundedNullableString(entry.shiftType)) {
      return fail(`entries[${index}].shiftType must be a string of at most ${MAX_VLM_STRING} chars or null`);
    }
    if (!isValidTime(entry.startTime)) {
      return fail(`entries[${index}].startTime must be HH:mm (00-23:00-59) or null`);
    }
    if (!isValidTime(entry.endTime)) {
      return fail(`entries[${index}].endTime must be HH:mm (00-23:00-59) or null`);
    }
    if (!isBoundedNullableString(entry.notes)) {
      return fail(`entries[${index}].notes must be a string of at most ${MAX_VLM_STRING} chars or null`);
    }
  }
  return { ok: true, value: payload };
}
