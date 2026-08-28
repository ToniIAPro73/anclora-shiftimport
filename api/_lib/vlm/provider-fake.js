/**
 * VLM fallback (server): deterministic fake provider for tests and visual QA.
 * No network access. Behavior is driven by env:
 *   VLM_FAKE_BEHAVIOR: success (default) | partial | malformed | timeout
 *                      | rate-limited | provider-error
 *   VLM_FAKE_DELAY_MS: extra latency in ms (default 0); in `timeout` mode the
 *                      provider waits LONGER than timeoutMs so the caller's
 *                      timeout semantics are exercised end-to-end.
 * `malformed` output is routed through the real validateVlmExtraction, so the
 * VLM_INVALID_RESPONSE path is the same one a misbehaving real provider hits.
 */
import { VlmError, DEFAULT_VLM_TIMEOUT_MS } from './provider.js';
import { validateVlmExtraction } from './schema.js';

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

function syntheticDate(year, month, day) {
  const clamped = Math.min(day, daysInMonth(year, month));
  const mm = String(month).padStart(2, '0');
  const dd = String(clamped).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function successPayload(hint) {
  const year = Number.isInteger(hint?.year) ? hint.year : 2026;
  const month = Number.isInteger(hint?.month) ? hint.month : 9;
  return {
    employeeName: 'FAKE EMPLOYEE',
    externalEmployeeId: 'FAKE-001',
    areaName: 'Fake Area',
    entries: [
      {
        date: syntheticDate(year, month, 1), shiftType: 'Regular', startTime: '07:00', endTime: '15:00', notes: null,
      },
      {
        date: syntheticDate(year, month, 2), shiftType: 'Regular', startTime: '15:00', endTime: '23:00', notes: null,
      },
      {
        date: syntheticDate(year, month, 3), shiftType: 'Libre', startTime: null, endTime: null, notes: null,
      },
    ],
  };
}

function partialPayload(hint) {
  const year = Number.isInteger(hint?.year) ? hint.year : 2026;
  const month = Number.isInteger(hint?.month) ? hint.month : 9;
  return {
    employeeName: null,
    externalEmployeeId: null,
    areaName: null,
    entries: [
      {
        date: syntheticDate(year, month, 1), shiftType: null, startTime: null, endTime: null, notes: null,
      },
    ],
  };
}

export function createFakeVlmProvider(env = process.env) {
  return {
    name: 'fake',

    async analyze({ hint = {}, timeoutMs = DEFAULT_VLM_TIMEOUT_MS }) {
      const behavior = env.VLM_FAKE_BEHAVIOR || 'success';
      const delayMs = Number.parseInt(env.VLM_FAKE_DELAY_MS ?? '0', 10) || 0;

      if (behavior === 'timeout') {
        await sleep(Math.max(delayMs, timeoutMs + 50));
        throw new VlmError('VLM_TIMEOUT', 504, 'Fake VLM provider timed out');
      }
      if (delayMs > 0) {
        await sleep(delayMs);
      }
      if (behavior === 'rate-limited') {
        throw new VlmError('VLM_RATE_LIMITED', 429, 'Fake VLM provider rate limit reached');
      }
      if (behavior === 'provider-error') {
        throw new VlmError('VLM_PROVIDER_ERROR', 502, 'Fake VLM provider failure');
      }

      const payload = behavior === 'partial'
        ? partialPayload(hint)
        : behavior === 'malformed'
          ? { employeeName: 42, entries: 'not-an-array' }
          : successPayload(hint);

      const validation = validateVlmExtraction(payload);
      if (!validation.ok) {
        throw new VlmError('VLM_INVALID_RESPONSE', 502, `Fake VLM output failed validation: ${validation.reason}`);
      }

      return {
        records: validation.value,
        usage: { inputTokens: 1234, outputTokens: 56 },
        provider: 'fake',
        model: 'fake-vlm-0',
      };
    },
  };
}
