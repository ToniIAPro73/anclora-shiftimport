import { PdfDocumentType } from '../../lib/import-types';
import { TYPE_A_PROFILE } from './type-a';
import { TYPE_B_PROFILE } from './type-b';
import { IngestionProfile } from './types';

/**
 * Registry of known ingestion profiles. Order matters: detection tries
 * profiles in this order and the first match wins.
 */
export const INGESTION_PROFILES: IngestionProfile[] = [TYPE_A_PROFILE, TYPE_B_PROFILE];

export function getIngestionProfile(documentType: PdfDocumentType): IngestionProfile | null {
  return INGESTION_PROFILES.find((profile) => profile.id === documentType) ?? null;
}
