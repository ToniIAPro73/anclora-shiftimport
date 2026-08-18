/**
 * Supported import formats capability registry (Phase 0 M0).
 *
 * The UI derives its file input `accept` and its visible format list from
 * this registry. A format is listed only when a real parser path exists;
 * PARTIAL formats have a working architecture but limited fidelity (e.g.
 * OCR depends on the source document).
 */
export interface ImportFormatCapability {
  /** Logical format group id (matches DocumentKind in parsers/file.ts). */
  id: string;
  /** Short label shown in the import UI. */
  label: string;
  extensions: string[];
  mimeTypes: string[];
  /** Human-readable parser path. */
  parser: string;
  capability: 'SUPPORTED' | 'PARTIAL' | 'NOT_SUPPORTED';
  notes?: string;
}

export const SUPPORTED_IMPORT_FORMATS: ImportFormatCapability[] = [
  {
    id: 'pdf',
    label: 'PDF',
    extensions: ['.pdf'],
    mimeTypes: ['application/pdf'],
    parser: 'PDF.js extraction → ingestion profiles (TYPE_A / TYPE_B / TYPE_TAB)',
    capability: 'SUPPORTED',
  },
  {
    id: 'image',
    label: 'PNG · JPG · WEBP',
    extensions: ['.png', '.jpg', '.jpeg', '.webp'],
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    parser: 'Tesseract OCR (local, spa) → ingestion core',
    capability: 'PARTIAL',
    notes: 'OCR corre en el navegador; la precisión depende del documento.',
  },
  {
    id: 'csv',
    label: 'CSV',
    extensions: ['.csv'],
    mimeTypes: ['text/csv'],
    parser: 'Canonical roster CSV (alias headers) o cuadrícula tabular',
    capability: 'SUPPORTED',
  },
  {
    id: 'xlsx',
    label: 'XLSX',
    extensions: ['.xlsx', '.xls'],
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
    parser: 'ExcelJS → cuadrícula tabular',
    capability: 'PARTIAL',
    notes: 'Primera hoja, celdas tratadas como cuadrícula tabular.',
  },
];

export const NOT_SUPPORTED_FORMATS: ImportFormatCapability[] = [];

const formatById = new Map(SUPPORTED_IMPORT_FORMATS.map((format) => [format.id, format]));

export function getImportFormat(formatId: string): ImportFormatCapability | undefined {
  return formatById.get(formatId);
}

/** Builds the `accept` attribute of the file input from the registry. */
export function importAcceptAttribute(): string {
  return SUPPORTED_IMPORT_FORMATS
    .flatMap((format) => [...format.extensions, ...format.mimeTypes])
    .join(',');
}

/** Human label used when showing the detected format, e.g. "Detectado: CSV". */
export function getImportFormatLabel(formatId: string): string {
  return formatById.get(formatId)?.label ?? formatId.toUpperCase();
}

/** Short display line for the import UI, e.g. "PDF · PNG · JPG · WEBP · CSV · XLSX". */
export function importFormatsDisplayLine(): string {
  return SUPPORTED_IMPORT_FORMATS.map((format) => format.label).join(' · ');
}