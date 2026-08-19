import path from 'node:path';
import { definePositiveCase } from '../helpers/case-positive';
import { FIXTURE_ROOT } from '../helpers/env';

const GS02_DIR = path.join(FIXTURE_ROOT, 'GS-02_rotating-scan');
const GS08_DIR = path.join(FIXTURE_ROOT, 'GS-08_dense-image');
const GS09_DIR = path.join(FIXTURE_ROOT, 'GS-09_mobile-calendar');

const OCR_TIMEOUT = 9 * 60 * 1000; // in-browser OCR can take minutes
const TOLERANCE_95 = (n: number): number => Math.ceil(n * 0.95);

definePositiveCase({
  caseId: 'GS-02-CLEAN',
  fixtureDir: GS02_DIR,
  fixtureFile: path.join(GS02_DIR, 'clean.pdf'),
  employeeName: 'TEAM-A',
  employeeId: 'TEAM-A',
  monthLabel: 'Octubre',
  yearLabel: '2026',
  monthKey: '2026-10',
  expectedCount: 31,
  processTimeoutMs: OCR_TIMEOUT,
});

definePositiveCase({
  caseId: 'GS-02-DEGRADED',
  fixtureDir: GS02_DIR,
  fixtureFile: path.join(GS02_DIR, 'degraded.pdf'),
  employeeName: 'TEAM-A',
  employeeId: 'TEAM-A',
  monthLabel: 'Octubre',
  yearLabel: '2026',
  monthKey: '2026-10',
  expectedCount: 31,
  minCount: TOLERANCE_95(31),
  exactDates: false,
  processTimeoutMs: OCR_TIMEOUT,
});

definePositiveCase({
  caseId: 'GS-08-CLEAN-AP017',
  fixtureDir: GS08_DIR,
  fixtureFile: path.join(GS08_DIR, 'clean.png'),
  employeeName: 'AP-017',
  employeeId: 'AP-017',
  monthLabel: 'Octubre',
  yearLabel: '2026',
  monthKey: '2026-10',
  expectedCount: 7,
  processTimeoutMs: OCR_TIMEOUT,
});

definePositiveCase({
  caseId: 'GS-08-CLEAN-AP048',
  fixtureDir: GS08_DIR,
  fixtureFile: path.join(GS08_DIR, 'clean.png'),
  employeeName: 'AP-048',
  employeeId: 'AP-048',
  monthLabel: 'Octubre',
  yearLabel: '2026',
  monthKey: '2026-10',
  expectedCount: 7,
  processTimeoutMs: OCR_TIMEOUT,
});

for (const [caseId, file] of [
  ['GS-08-LOWRES', 'low-resolution.jpg'],
  ['GS-08-SKEWED', 'skewed.jpg'],
  ['GS-08-LOWCONTRAST', 'low-contrast.jpg'],
  ['GS-08-PERSPECTIVE', 'perspective.jpg'],
] as const) {
  definePositiveCase({
    caseId,
    fixtureDir: GS08_DIR,
    fixtureFile: path.join(GS08_DIR, file),
    employeeName: 'AP-017',
    employeeId: 'AP-017',
    monthLabel: 'Octubre',
    yearLabel: '2026',
    monthKey: '2026-10',
    expectedCount: 7,
    minCount: TOLERANCE_95(7),
    exactDates: false,
    processTimeoutMs: OCR_TIMEOUT,
  });
}

definePositiveCase({
  caseId: 'GS-09-CLEAN',
  fixtureDir: GS09_DIR,
  fixtureFile: path.join(GS09_DIR, 'clean.jpg'),
  employeeName: 'EMP-778',
  employeeId: 'EMP-778',
  monthLabel: 'Octubre',
  yearLabel: '2026',
  monthKey: '2026-10',
  expectedCount: 31,
  processTimeoutMs: OCR_TIMEOUT,
});

for (const [caseId, file] of [
  ['GS-09-CROPPED', 'cropped.jpg'],
  ['GS-09-COMPRESSED', 'compressed.jpg'],
] as const) {
  definePositiveCase({
    caseId,
    fixtureDir: GS09_DIR,
    fixtureFile: path.join(GS09_DIR, file),
    employeeName: 'EMP-778',
    employeeId: 'EMP-778',
    monthLabel: 'Octubre',
    yearLabel: '2026',
    monthKey: '2026-10',
    expectedCount: 31,
    minCount: TOLERANCE_95(31),
    exactDates: false,
    processTimeoutMs: OCR_TIMEOUT,
  });
}
