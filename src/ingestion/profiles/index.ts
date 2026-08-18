import { PdfDocumentType } from '../../lib/import-types';
import { TYPE_A_PROFILE } from './type-a';
import { TYPE_B_PROFILE } from './type-b';
import { TYPE_TAB_PROFILE } from './tabular';
import { IngestionProfile } from './types';

/**
 * Registry of known ingestion profiles. Order matters: detection tries
 * profiles in this order and the first match wins. TYPE_TAB stays last so
 * real company PDFs (TYPE_A/TYPE_B, stricter rules) win on documents that
 * also contain plain day headers.
 */
export const INGESTION_PROFILES: IngestionProfile[] = [
  TYPE_A_PROFILE,
  TYPE_B_PROFILE,
  TYPE_TAB_PROFILE,
];

export function getIngestionProfile(documentType: PdfDocumentType): IngestionProfile | null {
  return INGESTION_PROFILES.find((profile) => profile.id === documentType) ?? null;
}
