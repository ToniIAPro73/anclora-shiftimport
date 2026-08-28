/**
 * JSON team-roster adapter. Accepts three reasonable top-level shapes
 * (direct array, `{ shifts: [...] }`, or metadata + `{ shifts: [...] }` —
 * see SHIFTIMPORT_MULTIFORMAT_INGESTION J1/J2/J3) and a small set of field
 * aliases per record, then converges through the SAME normalizer the
 * CSV/table and XLSX paths use (adapters/structured-rows.ts) — no separate
 * JSON persistence path exists.
 *
 * Never silently imports on an unrecognized shape: when no array of
 * records can be identified, this throws IngestionError('UNKNOWN_STRUCTURED_SCHEMA')
 * rather than guessing.
 */
import { IngestionError } from '../../lib/ingestion-errors';
import { normalizeStructuredRows, RowDiagnostic, StructuredShiftRow } from './structured-rows';
import { TeamRosterDetection } from '../team-roster';

type JsonValue = string | number | boolean | null | undefined;
type JsonRecord = Record<string, JsonValue>;

/** Per-record field aliases (case-insensitive key match). */
const FIELD_ALIASES: Record<keyof StructuredShiftRow, string[]> = {
  employeeName: ['employeename', 'name', 'employee', 'worker'],
  externalEmployeeId: ['externalemployeeid', 'employeeid', 'external_id', 'id'],
  areaName: ['areaname', 'area'],
  areaCode: ['areacode', 'area_code'],
  date: ['date', 'fecha', 'shiftdate'],
  shiftType: ['shifttype', 'type', 'tipo'],
  startTime: ['starttime', 'start', 'from'],
  endTime: ['endtime', 'end', 'to'],
  notes: ['notes', 'notas', 'comment'],
  sourceRef: [],
};

function lookup(record: JsonRecord, field: keyof StructuredShiftRow): string {
  const aliases = FIELD_ALIASES[field];
  const keysByLower = new Map(Object.keys(record).map((key) => [key.toLowerCase(), key]));
  for (const alias of aliases) {
    const actualKey = keysByLower.get(alias);
    if (actualKey !== undefined) {
      const value = record[actualKey];
      if (value === null || value === undefined) {
        return '';
      }
      return String(value).trim();
    }
  }
  return '';
}

function findRecordArray(parsed: unknown): { records: unknown[]; meta: JsonRecord } {
  if (Array.isArray(parsed)) {
    return { records: parsed, meta: {} };
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    // Accept the first array-valued property that looks like a records
    // collection (shifts/records/rows/data/items) rather than hardcoding
    // "shifts" as the only legal key.
    const candidateKeys = ['shifts', 'records', 'rows', 'data', 'items'];
    for (const key of candidateKeys) {
      const value = obj[key];
      if (Array.isArray(value)) {
        const meta: JsonRecord = {};
        for (const [metaKey, metaValue] of Object.entries(obj)) {
          if (metaKey !== key && (typeof metaValue === 'string' || typeof metaValue === 'number')) {
            meta[metaKey] = metaValue;
          }
        }
        return { records: value, meta };
      }
    }
  }
  throw new IngestionError(
    'UNKNOWN_STRUCTURED_SCHEMA',
    'No se pudo identificar la lista de turnos dentro del JSON (se esperaba un array o un campo "shifts").',
  );
}

export interface JsonTeamRosterResult extends TeamRosterDetection {
  diagnostics: RowDiagnostic[];
  organization?: string;
  areaName?: string;
}

/**
 * Parses a JSON team roster into the canonical detection result. Throws
 * IngestionError('INVALID_JSON') on malformed JSON and
 * IngestionError('UNKNOWN_STRUCTURED_SCHEMA') when no record array can be
 * identified — both are controlled failures, never a silent empty import.
 */
export function parseJsonTeamRoster(text: string): JsonTeamRosterResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new IngestionError('INVALID_JSON', `JSON inválido: ${(err as Error).message}`);
  }

  const { records, meta } = findRecordArray(parsed);
  if (records.length === 0) {
    throw new IngestionError('UNKNOWN_STRUCTURED_SCHEMA', 'El JSON no contiene ningún turno.');
  }

  const documentAreaName = typeof meta.areaName === 'string' ? meta.areaName : undefined;
  const rows: StructuredShiftRow[] = records.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return {
        employeeName: '',
        externalEmployeeId: '',
        date: '',
        sourceRef: `shifts[${index}]`,
      };
    }
    const record = entry as JsonRecord;
    return {
      employeeName: lookup(record, 'employeeName'),
      externalEmployeeId: lookup(record, 'externalEmployeeId'),
      areaName: lookup(record, 'areaName') || documentAreaName,
      areaCode: lookup(record, 'areaCode'),
      date: lookup(record, 'date'),
      shiftType: lookup(record, 'shiftType'),
      startTime: lookup(record, 'startTime'),
      endTime: lookup(record, 'endTime'),
      notes: lookup(record, 'notes'),
      sourceRef: `shifts[${index}]`,
    };
  });

  const result = normalizeStructuredRows(rows);
  return {
    ...result,
    organization: typeof meta.organization === 'string' ? meta.organization : undefined,
    areaName: documentAreaName,
  };
}
