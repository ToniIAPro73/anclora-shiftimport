import path from 'node:path';
import { defineNegativeCase } from '../helpers/case-negative';
import { FIXTURE_ROOT } from '../helpers/env';

const NEG = path.join(FIXTURE_ROOT, '_negative');

defineNegativeCase({
  caseId: 'GS-07-DOCX',
  fixtureFile: path.join(FIXTURE_ROOT, 'GS-07_docx-unsupported', 'source.docx'),
  monthLabel: 'Octubre',
  yearLabel: '2026',
  acceptableErrorSubstrings: ['Formato de archivo no soportado.'],
});

defineNegativeCase({
  caseId: 'GN-01-UNKNOWN-EMP',
  fixtureFile: path.join(FIXTURE_ROOT, 'GS-03_hospitality', 'source.pdf'),
  employeeName: 'Persona Inexistente',
  employeeId: 'H-999',
  monthLabel: 'Octubre',
  yearLabel: '2026',
  acceptableErrorSubstrings: ['No se ha encontrado a este empleado en el documento.'],
});

defineNegativeCase({
  caseId: 'GN-02-AMBIGUOUS',
  fixtureFile: path.join(NEG, 'GN-02_ambiguous-employee', 'source.pdf'),
  employeeName: 'Ana López',
  employeeId: '',
  monthLabel: 'Octubre',
  yearLabel: '2026',
  acceptableErrorSubstrings: [
    'Hay varias coincidencias para este empleado',
    'No se ha podido reconocer la estructura de este documento.',
  ],
});

defineNegativeCase({
  caseId: 'GN-03-EMPTY',
  fixtureFile: path.join(NEG, 'GN-03_empty-document', 'source.pdf'),
  monthLabel: 'Octubre',
  yearLabel: '2026',
  acceptableErrorSubstrings: [
    'El documento no contiene texto extraíble.',
    'No se ha podido reconocer la estructura de este documento.',
  ],
});

defineNegativeCase({
  caseId: 'GN-04-MALFORMED-CSV',
  fixtureFile: path.join(NEG, 'GN-04_malformed-csv', 'source.csv'),
  monthLabel: 'Octubre',
  yearLabel: '2026',
  acceptableErrorSubstrings: [
    'El archivo tiene un formato interno no válido o dañado.',
    'No se ha podido reconocer la estructura de este documento.',
  ],
});

defineNegativeCase({
  caseId: 'GN-05-TXT',
  fixtureFile: path.join(NEG, 'GN-05_unsupported-format', 'source.txt'),
  monthLabel: 'Octubre',
  yearLabel: '2026',
  acceptableErrorSubstrings: ['Formato de archivo no soportado.'],
});

defineNegativeCase({
  caseId: 'GN-06-NO-SHIFTS',
  fixtureFile: path.join(NEG, 'GN-06_no-shifts-found', 'source.csv'),
  employeeName: 'NS-01',
  employeeId: 'NS-01',
  monthLabel: 'Octubre',
  yearLabel: '2026',
  acceptableErrorSubstrings: [
    'No se ha podido reconocer la estructura de este documento.',
    'No se han encontrado turnos',
    'No se ha encontrado a este empleado en el documento.',
  ],
});

defineNegativeCase({
  caseId: 'GN-07-LAYOUT',
  fixtureFile: path.join(NEG, 'GN-07_unsupported-layout', 'source.png'),
  monthLabel: 'Octubre',
  yearLabel: '2026',
  acceptableErrorSubstrings: [
    'No se ha podido reconocer la estructura de este documento.',
    'El documento no contiene texto extraíble.',
  ],
  processTimeoutMs: 9 * 60 * 1000, // OCR path
});
