import path from 'node:path';
import { definePositiveCase } from '../helpers/case-positive';
import { FIXTURE_ROOT } from '../helpers/env';

const GS01_DIR = path.join(FIXTURE_ROOT, 'GS-01_multi-month');
const GS01_FILE = path.join(GS01_DIR, 'source.pdf');
const GS03_DIR = path.join(FIXTURE_ROOT, 'GS-03_hospitality');
const GS03_FILE = path.join(GS03_DIR, 'source.pdf');

definePositiveCase({
  caseId: 'GS-01-SEP-CARLOS',
  fixtureDir: GS01_DIR,
  fixtureFile: GS01_FILE,
  employeeName: 'Carlos Ruiz',
  employeeId: 'EMP-102',
  monthLabel: 'Septiembre',
  yearLabel: '2026',
  monthKey: '2026-09',
  expectedCount: 30,
});

definePositiveCase({
  caseId: 'GS-01-OCT-CARLOS',
  fixtureDir: GS01_DIR,
  fixtureFile: GS01_FILE,
  employeeName: 'Carlos Ruiz',
  employeeId: 'EMP-102',
  monthLabel: 'Octubre',
  yearLabel: '2026',
  monthKey: '2026-10',
  expectedCount: 31,
});

definePositiveCase({
  caseId: 'GS-01-SEP-LUCIA',
  fixtureDir: GS01_DIR,
  fixtureFile: GS01_FILE,
  employeeName: 'Lucía Martín',
  employeeId: 'EMP-101',
  monthLabel: 'Septiembre',
  yearLabel: '2026',
  monthKey: '2026-09',
  expectedCount: 30,
});

definePositiveCase({
  caseId: 'GS-01-OCT-JORGE',
  fixtureDir: GS01_DIR,
  fixtureFile: GS01_FILE,
  employeeName: 'Jorge Vidal',
  employeeId: 'EMP-104',
  monthLabel: 'Octubre',
  yearLabel: '2026',
  monthKey: '2026-10',
  expectedCount: 31,
});

definePositiveCase({
  caseId: 'GS-03-ANA',
  fixtureDir: GS03_DIR,
  fixtureFile: GS03_FILE,
  employeeName: 'Ana López',
  employeeId: 'H-201',
  monthLabel: 'Octubre',
  yearLabel: '2026',
  monthKey: '2026-10',
  expectedCount: 14,
});

definePositiveCase({
  caseId: 'GS-03-NORA',
  fixtureDir: GS03_DIR,
  fixtureFile: GS03_FILE,
  employeeName: 'Nora Gil',
  employeeId: 'H-301',
  monthLabel: 'Octubre',
  yearLabel: '2026',
  monthKey: '2026-10',
  expectedCount: 14,
});
