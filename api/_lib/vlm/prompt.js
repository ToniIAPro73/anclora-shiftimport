/**
 * VLM fallback (server): extraction prompt. Fail-closed by instruction — the
 * model is told to extract ONLY what is visible and to use null otherwise;
 * the output is additionally validated against the schema, so a model that
 * ignores these rules produces VLM_INVALID_RESPONSE, never bad shifts.
 */

const RULES = [
  'Extract ONLY information that is actually visible in the document.',
  'Do NOT infer or guess times, dates, shift types or employee names that are not visible.',
  'Do NOT creatively "correct" or complete names or codes; transcribe them exactly as printed.',
  'Do NOT create shift entries from empty cells or empty rows.',
  'If a value is not visible or not legible, use null for that field.',
  'If something is ambiguous, preserve the ambiguity: use null instead of choosing an interpretation.',
  'Extract ALL visible records; do not stop at the first ones.',
  'Every entry date must be a real ISO calendar date in YYYY-MM-DD format.',
  'Times must be 24-hour HH:mm (00-23 hours, 00-59 minutes).',
  'Return ONLY valid JSON conforming to the required schema. No markdown, no commentary, no code fences.',
];

/**
 * Builds the system+user prompt for the shift-extraction vision call.
 * @param {{ month?: number, year?: number }} [hint] optional period hint from
 * the user's selected month/year. It is a hint, never a source of truth.
 * @returns {{ system: string, user: string }}
 */
export function buildVlmPrompt({ month, year } = {}) {
  const system = 'You are a precise vision extraction engine for work shift schedules. '
    + 'You read images of shift rosters/calendars and transcribe their content into strict JSON. '
    + 'You never invent data.';

  const hintLines = [];
  if (Number.isInteger(month) && Number.isInteger(year)) {
    hintLines.push(
      `Period hint: the document most likely belongs to month ${month} of year ${year}. `
      + 'Use this ONLY to resolve partially visible or ambiguous dates, and only when the document '
      + 'itself confirms that period (e.g. a printed month/year header). '
      + 'Never create dates from this hint alone.',
    );
  } else if (Number.isInteger(year)) {
    hintLines.push(
      `Period hint: the document most likely belongs to year ${year}. `
      + 'Use this ONLY to resolve ambiguous dates when the document itself confirms it. '
      + 'Never create dates from this hint alone.',
    );
  }

  const user = [
    'Extract the work shift schedule visible in the attached page image(s) into a single JSON object with this exact shape:',
    '{',
    '  "employeeName": string | null,        // employee the schedule belongs to, if visible',
    '  "externalEmployeeId": string | null,  // printed employee id/code, if visible',
    '  "areaName": string | null,            // department/area, if visible',
    '  "entries": [',
    '    {',
    '      "date": "YYYY-MM-DD",             // real calendar date, required',
    '      "shiftType": string | null,       // shift code/label exactly as printed',
    '      "startTime": "HH:mm" | null,',
    '      "endTime": "HH:mm" | null,',
    '      "notes": string | null',
    '    }',
    '  ]',
    '}',
    '',
    'RULES:',
    ...RULES.map((rule, index) => `${index + 1}. ${rule}`),
    ...hintLines.length > 0 ? ['', ...hintLines] : [],
  ].join('\n');

  return { system, user };
}
