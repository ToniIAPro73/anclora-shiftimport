/**
 * Fase 1.2F-PDF: async, File-consuming PDF team-import entry point. Roster
 * discovery only answers "who is in this document" (pdf-roster.ts);
 * extraction per employee reuses the exact same pipeline as the
 * single-employee flow (analyzeShiftsFromItems — now multi-page aware, see
 * row-detection.ts / parse-items.ts), so a fix to one flow is a fix to both.
 *
 * Unknown non-time codes (e.g. DL, AJ) are resolved automatically as rest
 * days for the WHOLE batch, sampled from whichever codes the first
 * employee's row surfaces — the legend is document-wide, not per-employee,
 * so there is no 40-person interactive Q&A. This mirrors the CSV team
 * import's structural "no times = Libre" policy (team-roster.ts): AJ is not
 * modeled as a distinct type from DL here either. The interactive
 * single-employee flow is untouched and still asks the token-meaning
 * question per code, unaffected by this batch policy.
 */
import { CalendarImportContext } from '../lib/import-types';
import { analyzeShiftsFromItems } from './analysis';
import { EmployeeSelector } from './core/row-detection';
import { ShiftCodeMapping } from './core/shift-code-profile';
import { PdfTextItem } from './core/text-items';
import { extractDocumentItems } from './parsers/file';
import { detectCalendarContextFromItems } from './parsers/parse-items';
import { detectPdfRoster, PdfRosterEmployee } from './pdf-roster';
import { DetectedTeamEmployee } from './team-roster';

export interface PdfTeamRosterDetection {
  employees: DetectedTeamEmployee[];
  context: CalendarImportContext;
}

const selectorFor = (employee: PdfRosterEmployee): EmployeeSelector => ({
  employeeName: employee.name,
  employeeIdentifiers: employee.externalEmployeeId ? [employee.externalEmployeeId] : [],
});

function buildAutoCodeOverrides(
  items: PdfTextItem[],
  context: CalendarImportContext,
  employees: PdfRosterEmployee[],
): Map<string, ShiftCodeMapping> {
  const overrides = new Map<string, ShiftCodeMapping>();
  const sample = employees[0];
  if (!sample) {
    return overrides;
  }
  const { analysis } = analyzeShiftsFromItems(items, context, selectorFor(sample));
  for (const token of analysis.unknownTokens) {
    const code = token.trim().toUpperCase();
    if (code) {
      overrides.set(code, { code, startTime: null, endTime: null, status: 'free' });
    }
  }
  return overrides;
}

export async function detectPdfTeamRoster(file: File): Promise<PdfTeamRosterDetection | null> {
  const items = await extractDocumentItems(file);
  const roster = detectPdfRoster(items);
  if (!roster || roster.employees.length === 0) {
    return null;
  }

  const context = detectCalendarContextFromItems(items);
  const codeOverrides = buildAutoCodeOverrides(items, context, roster.employees);

  const employees: DetectedTeamEmployee[] = roster.employees.map((employee) => {
    const { shifts } = analyzeShiftsFromItems(items, context, selectorFor(employee), undefined, codeOverrides);
    return { key: employee.key, externalEmployeeId: employee.externalEmployeeId, name: employee.name, shifts };
  });

  return { employees, context };
}
