import { describe, expect, it } from 'vitest';
import { buildVlmPrompt } from './prompt.js';
import { createVlmProvider, VlmError } from './provider.js';
import { validateVlmExtraction, VLM_EXTRACTION_SCHEMA } from './schema.js';

const validEntry = (overrides = {}) => ({
  date: '2026-09-01',
  shiftType: 'Regular',
  startTime: '07:00',
  endTime: '15:00',
  notes: null,
  ...overrides,
});

const validPayload = (overrides = {}) => ({
  employeeName: 'Employee One',
  externalEmployeeId: null,
  areaName: null,
  entries: [validEntry()],
  ...overrides,
});

describe('validateVlmExtraction', () => {
  it('accepts a fully populated payload', () => {
    const result = validateVlmExtraction(validPayload());
    expect(result).toEqual({ ok: true, value: validPayload() });
  });

  it('accepts all-null nullable fields and empty entries', () => {
    const result = validateVlmExtraction({
      employeeName: null, externalEmployeeId: null, areaName: null, entries: [],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects non-object payloads', () => {
    expect(validateVlmExtraction(null).ok).toBe(false);
    expect(validateVlmExtraction('[]').ok).toBe(false);
    expect(validateVlmExtraction([]).ok).toBe(false);
  });

  it('rejects unknown keys (strict schema)', () => {
    expect(validateVlmExtraction(validPayload({ color: 'blue' })).ok).toBe(false);
    expect(validateVlmExtraction(validPayload({ entries: [validEntry({ day: 1 })] })).ok).toBe(false);
  });

  it('rejects impossible calendar dates (2026-02-30)', () => {
    const result = validateVlmExtraction(validPayload({ entries: [validEntry({ date: '2026-02-30' })] }));
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('date');
  });

  it('rejects malformed dates', () => {
    expect(validateVlmExtraction(validPayload({ entries: [validEntry({ date: '01/09/2026' })] })).ok).toBe(false);
    expect(validateVlmExtraction(validPayload({ entries: [validEntry({ date: null })] })).ok).toBe(false);
  });

  it('rejects out-of-range times (24:00, 12:60) but accepts boundaries', () => {
    expect(validateVlmExtraction(validPayload({ entries: [validEntry({ startTime: '24:00' })] })).ok).toBe(false);
    expect(validateVlmExtraction(validPayload({ entries: [validEntry({ endTime: '12:60' })] })).ok).toBe(false);
    expect(validateVlmExtraction(validPayload({ entries: [validEntry({ startTime: '23:59', endTime: '00:00' })] })).ok).toBe(true);
  });

  it('rejects arrays/strings beyond the bounds', () => {
    const manyEntries = { entries: Array.from({ length: 201 }, () => validEntry()) };
    expect(validateVlmExtraction(validPayload(manyEntries)).ok).toBe(false);
    expect(validateVlmExtraction(validPayload({ employeeName: 'x'.repeat(201) })).ok).toBe(false);
    expect(validateVlmExtraction(validPayload({ entries: [validEntry({ notes: 'x'.repeat(201) })] })).ok).toBe(false);
  });

  it('rejects entries that are not an array', () => {
    expect(validateVlmExtraction(validPayload({ entries: 'nope' })).ok).toBe(false);
  });

  it('exports a strict JSON schema mirror', () => {
    expect(VLM_EXTRACTION_SCHEMA.additionalProperties).toBe(false);
    expect(VLM_EXTRACTION_SCHEMA.required).toContain('entries');
    expect(VLM_EXTRACTION_SCHEMA.properties.entries.maxItems).toBe(200);
  });
});

describe('buildVlmPrompt', () => {
  it('includes the no-invention rules and the JSON-only instruction', () => {
    const { system, user } = buildVlmPrompt({});
    expect(system).toMatch(/never invent/i);
    expect(user).toMatch(/ONLY information that is actually visible/i);
    expect(user).toMatch(/ONLY valid JSON/i);
    expect(user).toContain('"entries"');
  });

  it('mentions the month/year hint only as a hint when provided', () => {
    const { user } = buildVlmPrompt({ month: 9, year: 2026 });
    expect(user).toContain('month 9 of year 2026');
    expect(user).toMatch(/Never create dates from this hint alone/i);
  });

  it('omits the hint section when not provided', () => {
    const { user } = buildVlmPrompt({});
    expect(user).not.toContain('Period hint');
  });
});

describe('createVlmProvider', () => {
  it('defaults to openai-compatible and supports fake', () => {
    expect(createVlmProvider({}).name).toBe('openai-compatible');
    expect(createVlmProvider({ VLM_PROVIDER: 'fake' }).name).toBe('fake');
  });

  it('throws VLM_UNAVAILABLE for an unknown provider kind', () => {
    try {
      createVlmProvider({ VLM_PROVIDER: 'wat' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(VlmError);
      expect(error.code).toBe('VLM_UNAVAILABLE');
      expect(error.status).toBe(503);
    }
  });
});

describe('openai-compatible provider (config gate only, no fetch)', () => {
  it('throws VLM_UNAVAILABLE when key/url/model are missing', async () => {
    const provider = createVlmProvider({});
    await expect(provider.analyze({ pages: [], hint: {}, timeoutMs: 10 }))
      .rejects.toMatchObject({ code: 'VLM_UNAVAILABLE', status: 503 });
  });
});

describe('fake provider', () => {
  const page = { imageBase64: 'QUJD', mimeType: 'image/png' };

  it('success: 3 plausible records within the hinted period', async () => {
    const provider = createVlmProvider({ VLM_PROVIDER: 'fake' });
    const result = await provider.analyze({ pages: [page], hint: { month: 3, year: 2027 }, timeoutMs: 1000 });
    expect(result.provider).toBe('fake');
    expect(result.usage).toEqual({ inputTokens: 1234, outputTokens: 56 });
    expect(result.records.employeeName).toBe('FAKE EMPLOYEE');
    expect(result.records.entries).toHaveLength(3);
    for (const entry of result.records.entries) {
      expect(entry.date).toMatch(/^2027-03-\d{2}$/);
    }
  });

  it('success without hint defaults to September 2026', async () => {
    const provider = createVlmProvider({ VLM_PROVIDER: 'fake' });
    const result = await provider.analyze({ pages: [page], hint: {}, timeoutMs: 1000 });
    expect(result.records.entries[0].date).toMatch(/^2026-09-/);
  });

  it('partial: 1 record with null fields', async () => {
    const provider = createVlmProvider({ VLM_PROVIDER: 'fake', VLM_FAKE_BEHAVIOR: 'partial' });
    const result = await provider.analyze({ pages: [page], hint: {}, timeoutMs: 1000 });
    expect(result.records.entries).toHaveLength(1);
    expect(result.records.entries[0].shiftType).toBeNull();
  });

  it('malformed: goes through the real validator and throws VLM_INVALID_RESPONSE', async () => {
    const provider = createVlmProvider({ VLM_PROVIDER: 'fake', VLM_FAKE_BEHAVIOR: 'malformed' });
    await expect(provider.analyze({ pages: [page], hint: {}, timeoutMs: 1000 }))
      .rejects.toMatchObject({ code: 'VLM_INVALID_RESPONSE', status: 502 });
  });

  it('timeout: waits longer than timeoutMs, then throws VLM_TIMEOUT', async () => {
    const provider = createVlmProvider({ VLM_PROVIDER: 'fake', VLM_FAKE_BEHAVIOR: 'timeout' });
    const startedAt = Date.now();
    await expect(provider.analyze({ pages: [page], hint: {}, timeoutMs: 50 }))
      .rejects.toMatchObject({ code: 'VLM_TIMEOUT', status: 504 });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(90);
  });

  it('rate-limited and provider-error map to their codes', async () => {
    const limited = createVlmProvider({ VLM_PROVIDER: 'fake', VLM_FAKE_BEHAVIOR: 'rate-limited' });
    await expect(limited.analyze({ pages: [page], hint: {}, timeoutMs: 1000 }))
      .rejects.toMatchObject({ code: 'VLM_RATE_LIMITED', status: 429 });

    const broken = createVlmProvider({ VLM_PROVIDER: 'fake', VLM_FAKE_BEHAVIOR: 'provider-error' });
    await expect(broken.analyze({ pages: [page], hint: {}, timeoutMs: 1000 }))
      .rejects.toMatchObject({ code: 'VLM_PROVIDER_ERROR', status: 502 });
  });
});
