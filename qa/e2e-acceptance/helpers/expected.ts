import fs from 'node:fs';
import path from 'node:path';

export interface ExpectedAssignment {
  employee_id: string;
  employee_name: string | null;
  date: string; // YYYY-MM-DD
  shift_code: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
}

export interface ExpectedFile {
  expected_result: string;
  expected_behavior: string;
  assignments: ExpectedAssignment[];
}

export function loadExpected(fixtureDir: string): ExpectedFile {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, 'expected.json'), 'utf8')) as ExpectedFile;
}

export interface FilteredExpectation {
  count: number;
  dates: string[];
  byDate: Map<string, ExpectedAssignment>;
  /** shift_code → status, for assistant token classification. */
  codeStatus: Map<string, string>;
}

/** Assignments for one employee (+optional month filter YYYY-MM). */
export function expectationsFor(
  fixtureDir: string,
  employeeId: string,
  month?: string,
): FilteredExpectation {
  const file = loadExpected(fixtureDir);
  const rows = file.assignments.filter(
    (a) => a.employee_id === employeeId && (!month || a.date.startsWith(month)),
  );
  const byDate = new Map(rows.map((a) => [a.date, a]));
  const codeStatus = new Map<string, string>();
  for (const a of file.assignments) {
    if (a.shift_code && !codeStatus.has(a.shift_code)) {
      codeStatus.set(a.shift_code, a.status);
    }
  }
  return {
    count: rows.length,
    dates: rows.map((a) => a.date).sort(),
    byDate,
    codeStatus,
  };
}
