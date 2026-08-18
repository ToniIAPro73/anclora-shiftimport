/**
 * Canonical ingestion error codes (corpus manifest), used by the ingestion
 * pipeline and surfaced by the acceptance corpus runner.
 */
export type IngestionErrorCode =
  | 'UNKNOWN_EMPLOYEE'
  | 'AMBIGUOUS_EMPLOYEE'
  | 'EMPTY_DOCUMENT'
  | 'MALFORMED_INPUT'
  | 'UNSUPPORTED_FORMAT'
  | 'NO_SHIFTS_FOUND'
  | 'UNSUPPORTED_LAYOUT';

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