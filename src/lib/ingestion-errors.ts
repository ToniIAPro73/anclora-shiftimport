/**
 * Canonical ingestion error codes (corpus manifest), used by the ingestion
 * pipeline and surfaced by the acceptance corpus runner.
 */
export type IngestionErrorCode =
  | 'UNKNOWN_EMPLOYEE'
  | 'AMBIGUOUS_EMPLOYEE'
  | 'IDENTITY_MISMATCH'
  | 'EMPTY_DOCUMENT'
  | 'MALFORMED_INPUT'
  | 'UNSUPPORTED_FORMAT'
  | 'NO_SHIFTS_FOUND'
  | 'UNSUPPORTED_LAYOUT'
  // Structured-diagnosis codes (src/ingestion/diagnostics.ts). These are
  // emitted as diagnostics, not necessarily thrown as IngestionError.
  | 'UNKNOWN_SHIFT_CODES'
  | 'DATE_AMBIGUITY'
  | 'MONTH_MISMATCH'
  | 'PARTIAL_EXTRACTION'
  | 'INCOMPLETE_TIMES'
  | 'INSUFFICIENT_DATA'
  | 'PARSER_FAILURE';

export class IngestionError extends Error {
  readonly code: IngestionErrorCode;

  constructor(code: IngestionErrorCode, message: string) {
    super(message);
    this.name = 'IngestionError';
    this.code = code;
  }
}

export function toIngestionErrorCode(error: unknown): IngestionErrorCode | null {
  if (error instanceof IngestionError) {
    return error.code;
  }
  return null;
}