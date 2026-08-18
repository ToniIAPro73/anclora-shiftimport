/**
 * Document type detection: the first registered profile whose detection
 * rule matches the extracted items wins; otherwise UNKNOWN.
 */
import { PdfDocumentType } from '../../lib/import-types';
import { normalizeText } from '../core/normalize';
import { PdfTextItem } from '../core/text-items';
import { INGESTION_PROFILES } from '../profiles';

export function detectPdfDocumentTypeFromItems(items: PdfTextItem[]): PdfDocumentType {
  for (const profile of INGESTION_PROFILES) {
    const patternsMatch = profile.detection.itemPatterns.every(
      (pattern) => items.some((item) => pattern.test(item.text)),
    );
    const includesMatch = profile.detection.normalizedIncludes.every(
      (token) => items.some((item) => normalizeText(item.text).includes(token)),
    );

    if (patternsMatch && includesMatch) {
      return profile.id;
    }
  }

  return 'UNKNOWN';
}
