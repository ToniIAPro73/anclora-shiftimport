import path from 'node:path';
import { definePositiveCase } from '../helpers/case-positive';
import { FIXTURE_ROOT } from '../helpers/env';

const GS04_DIR = path.join(FIXTURE_ROOT, 'GS-04_restaurant-xlsx');
const GS05_DIR = path.join(FIXTURE_ROOT, 'GS-05_hospital-xlsx');
const GS06_DIR = path.join(FIXTURE_ROOT, 'GS-06_irregular-csv');
const GS10_DIR = path.join(FIXTURE_ROOT, 'GS-10_domain-edge-cases');

definePositiveCase({
  caseId: 'GS-04-MIGUEL',
  fixtureDir: GS04_DIR,
  fixtureFile: path.join(GS04_DIR, 'source.xlsx'),
  employeeName: 'Miguel Cano',
  employeeId: 'R-002',
  monthLabel: 'Octubre',
  yearLabel: '2026',
  monthKey: '2026-10',
  expectedCount: 7,
});

definePositiveCase({
  caseId: 'GS-05-SARA',
  fixtureDir: GS05_DIR,
  fixtureFile: path.join(GS05_DIR, 'source.xlsx'),
  employeeName: 'Sara Vidal',
  employeeId: 'N-12',
  monthLabel: 'Octubre',
  yearLabel: '2026',
  monthKey: '2026-10',
  expectedCount: 31,
});

definePositiveCase({
  caseId: 'GS-06-OP001',
  fixtureDir: GS06_DIR,
  fixtureFile: path.join(GS06_DIR, 'source.csv'),
  employeeName: 'OP-001',
  employeeId: 'OP-001',
  monthLabel: 'Octubre',
  yearLabel: '2026',
  monthKey: '2026-10',
  expectedCount: 3,
});

definePositiveCase({
  caseId: 'GS-10-EVA',
  fixtureDir: GS10_DIR,
  fixtureFile: path.join(GS10_DIR, 'source.csv'),
  employeeName: 'Eva Test',
  employeeId: 'EDGE-01',
  monthLabel: 'Octubre',
  yearLabel: '2026',
  monthKey: '2026-10',
  expectedCount: 10,
});
