/**
 * Fase 1.2F-PDF: roster discovery for positional PDF documents.
 *
 * The row-detection core (core/row-detection.ts) only ever locates ONE
 * employee at a time, given a caller-provided selector — there is no
 * generic "list everyone printed here" path. This module adds exactly
 * that, scanning every page's marker column for id+name pairs instead of
 * searching for one specific identity.
 *
 * Deliberately generic across profiles: the id-detection pattern comes from
 * the profile's own row-window floor scan (the same pattern row-detection
 * already trusts to recognize "this is an id, not free text"), not a
 * hardcoded shape — a profile with a different id convention still works
 * without touching this module.
 */
import { normalizeEmployeeId, normalizeText } from './core/normalize';
import { PdfTextItem, sortPdfItemsForReading } from './core/text-items';
import { findAllNameMarkerBands, nameMarkerBandText } from './core/row-detection';
import { detectPdfDocumentTypeFromItems } from './parsers/detect';
import { getIngestionProfile } from './profiles';
import { IngestionProfile } from './profiles/types';

export interface PdfRosterEmployee {
  /** Stable grouping key: normalized digits-only id when present, else a normalized-name key. */
  key: string;
  externalEmployeeId: string;
  name: string;
}

export interface PdfRosterDetection {
  profile: IngestionProfile;
  employees: PdfRosterEmployee[];
}

const FALLBACK_ID_PATTERN = /^\d{4,6}$/;

export function detectPdfRoster(items: PdfTextItem[]): PdfRosterDetection | null {
  if (items.length === 0) {
    return null;
  }
  const profile = getIngestionProfile(detectPdfDocumentTypeFromItems(items));
  if (!profile) {
    return null;
  }

  const { markerMaxX, dataMinX, nameMaxX = dataMinX } = profile.rowWindow;
  const idPattern = profile.rowWindow.floor.mode === 'next-row-boundary' && profile.rowWindow.floor.scan.idPattern
    ? profile.rowWindow.floor.scan.idPattern
    : FALLBACK_ID_PATTERN;

  const byKey = new Map<string, PdfRosterEmployee>();
  const pages = Array.from(new Set(items.map((item) => item.page)));

  for (const page of pages) {
    // Ids are reliably narrow/left-aligned (x < markerMaxX). Names are NOT:
    // dense real layouts print the name right after a variable-width id, so
    // its start x drifts with the id's own digit count — some names land a
    // few points past markerMaxX. Scanning for id items only up to
    // markerMaxX, but names up to dataMinX (findAllNameMarkerBands — the
    // same rule the single-employee row-detection engine already uses), so
    // a name a few points wide of the marker column is never silently
    // dropped from the candidate pool (which previously made its id fall
    // back to the nearest OTHER row's name instead).
    const pageItems = sortPdfItemsForReading(items.filter((item) => item.page === page && item.x < nameMaxX));
    const idItems = pageItems.filter((item) => item.x < markerMaxX && idPattern.test(normalizeEmployeeId(item.text)));
    const nameBands = findAllNameMarkerBands(pageItems, profile.rowWindow);

    for (const idItem of idItems) {
      // Nearest name band by |Δy| — same disambiguation rule as the
      // identity-mismatch owner lookup (core/row-detection.ts): a wide
      // net around the id can catch a neighbouring employee's name too,
      // proximity to the id's own line is what actually identifies "theirs".
      const nameBand = [...nameBands].sort(
        (left, right) => Math.abs(left[0].y - idItem.y) - Math.abs(right[0].y - idItem.y),
      )[0];
      if (!nameBand) {
        continue;
      }
      const name = nameMarkerBandText(nameBand);
      if (!name) {
        continue;
      }

      const externalEmployeeId = idItem.text.trim();
      const normalizedId = normalizeEmployeeId(externalEmployeeId);
      const key = normalizedId || `name:${normalizeText(name)}`;
      if (!byKey.has(key)) {
        byKey.set(key, { key, externalEmployeeId, name });
      }
    }
  }

  return byKey.size > 0 ? { profile, employees: [...byKey.values()] } : null;
}
