/**
 * XML team-roster adapter. Uses the platform's native DOMParser — not a
 * regex scraper, not a new dependency. DOMParser (browser and jsdom, which
 * back every environment this app runs or is tested in) never resolves
 * external entities and never performs network or filesystem I/O while
 * parsing: there is no XXE surface to disable because the parser has no
 * such capability to begin with. Adding a Node XML library (e.g.
 * xml2js/fast-xml-parser/libxml bindings) would only reintroduce a class of
 * risk (external entity / DTD handling) that has to be explicitly
 * configured away — native DOMParser is the smaller, safer, dependency-free
 * choice for this browser-only ingestion path.
 *
 * Supported shapes (X1/X2/X3):
 *   <schedule><shifts><shift>...</shift></shifts></schedule>
 *   <shifts><shift>...</shift></shifts>
 *   <schedule><organization/><areaName/><period/><shifts>...</shifts></schedule>
 *
 * Converges through the same normalizer as every other format
 * (adapters/structured-rows.ts) — no parallel XML persistence path.
 */
import { IngestionError } from '../../lib/ingestion-errors';
import { normalizeStructuredRows, RowDiagnostic, StructuredShiftRow } from './structured-rows';
import { TeamRosterDetection } from '../team-roster';

const FIELD_TAGS: Record<keyof StructuredShiftRow, string[]> = {
  employeeName: ['employeeName', 'name', 'employee'],
  externalEmployeeId: ['externalEmployeeId', 'employeeId', 'externalId', 'id'],
  areaName: ['areaName', 'area'],
  areaCode: ['areaCode'],
  date: ['date', 'fecha'],
  shiftType: ['shiftType', 'type', 'tipo'],
  startTime: ['startTime', 'start'],
  endTime: ['endTime', 'end'],
  notes: ['notes', 'notas'],
  sourceRef: [],
};

function childText(element: Element, tags: string[]): string {
  for (const tag of tags) {
    const found = [...element.children].find((child) => child.tagName.toLowerCase() === tag.toLowerCase());
    if (found) {
      return (found.textContent ?? '').trim();
    }
  }
  return '';
}

function findShiftElements(doc: Document): { elements: Element[]; areaName: string } {
  const root = doc.documentElement;
  if (!root) {
    throw new IngestionError('INVALID_XML', 'El XML no tiene elemento raíz.');
  }
  // X2: <shifts> is itself the root.
  const shiftsContainer = root.tagName.toLowerCase() === 'shifts'
    ? root
    : [...root.children].find((child) => child.tagName.toLowerCase() === 'shifts');

  if (!shiftsContainer) {
    throw new IngestionError(
      'UNKNOWN_STRUCTURED_SCHEMA',
      'No se encontró un elemento <shifts> en el XML.',
    );
  }

  const elements = [...shiftsContainer.children].filter((child) => child.tagName.toLowerCase() === 'shift');
  const areaName = root.tagName.toLowerCase() !== 'shifts' ? childText(root, FIELD_TAGS.areaName) : '';
  return { elements, areaName };
}

export interface XmlTeamRosterResult extends TeamRosterDetection {
  diagnostics: RowDiagnostic[];
  areaName?: string;
}

/**
 * Parses an XML team roster into the canonical detection result. Throws
 * IngestionError('INVALID_XML') for malformed markup and
 * IngestionError('UNKNOWN_STRUCTURED_SCHEMA') when no <shifts> collection
 * is found — both controlled failures, never a silent empty import.
 */
export function parseXmlTeamRoster(text: string): XmlTeamRosterResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  const parserError = doc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    // Both browsers and jsdom prepend a human summary line before a
    // "rendering of the page" dump of the offending markup — keep only
    // that summary, the rest is internal parser noise the user can't act on.
    const raw = (parserError.textContent ?? '').replace(/\s+/g, ' ').trim();
    const summary = raw.split(/Below is a rendering/i)[0].trim() || 'error de sintaxis';
    throw new IngestionError('INVALID_XML', `XML mal formado: ${summary}`);
  }

  const { elements, areaName: documentAreaName } = findShiftElements(doc);
  if (elements.length === 0) {
    throw new IngestionError('UNKNOWN_STRUCTURED_SCHEMA', 'El XML no contiene ningún <shift>.');
  }

  const rows: StructuredShiftRow[] = elements.map((element, index) => ({
    employeeName: childText(element, FIELD_TAGS.employeeName),
    externalEmployeeId: childText(element, FIELD_TAGS.externalEmployeeId),
    areaName: childText(element, FIELD_TAGS.areaName) || documentAreaName || undefined,
    areaCode: childText(element, FIELD_TAGS.areaCode),
    date: childText(element, FIELD_TAGS.date),
    shiftType: childText(element, FIELD_TAGS.shiftType),
    startTime: childText(element, FIELD_TAGS.startTime),
    endTime: childText(element, FIELD_TAGS.endTime),
    notes: childText(element, FIELD_TAGS.notes),
    sourceRef: `shift[${index}]`,
  }));

  const result = normalizeStructuredRows(rows);
  return { ...result, areaName: documentAreaName || undefined };
}
