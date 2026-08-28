/**
 * VLM fallback trigger (pure): decides, after the deterministic pipeline has
 * run, whether a document qualifies for the server-side visual analysis
 * (POST /api/ingestion/vlm).
 *
 * Policy:
 * - Only visually-renderable kinds (pdf/image) qualify — structured text
 *   formats (csv/excel/text) never need a vision model.
 * - Guests never qualify: the endpoint requires an authenticated session.
 * - Eligibility is reserved for documents the deterministic pipeline could
 *   not read at all (no items, UNRECOGNIZED with zero shifts) or whose
 *   diagnosis is a dead end (BLOCKED/UNSUPPORTED). A usable deterministic
 *   result is never re-analyzed: CORRECT with records is a reliable result,
 *   anything else usable is simply DETERMINISTIC_OK.
 */
import type { ImportResult } from '../lib/import-quality';
import type { DocumentKind } from './parsers/file';
import type { ImportState } from './diagnostics';

export type VlmTriggerDecision =
  | { kind: 'DETERMINISTIC_OK' }
  | { kind: 'VLM_NOT_ELIGIBLE'; reason: 'structured-format' | 'reliable-result' | 'unauthenticated' }
  | { kind: 'VLM_ELIGIBLE'; reason: 'empty-items' | 'unrecognized' | 'blocked-diagnosis' };

export function classifyVlmTrigger(args: {
  kind: DocumentKind;
  itemCount: number;
  quality: ImportResult;
  diagnosisState?: ImportState;
  authenticated: boolean;
}): VlmTriggerDecision {
  if (args.kind !== 'pdf' && args.kind !== 'image') {
    return { kind: 'VLM_NOT_ELIGIBLE', reason: 'structured-format' };
  }
  if (!args.authenticated) {
    return { kind: 'VLM_NOT_ELIGIBLE', reason: 'unauthenticated' };
  }
  if (args.itemCount === 0) {
    return { kind: 'VLM_ELIGIBLE', reason: 'empty-items' };
  }
  if (args.quality.state === 'UNRECOGNIZED' && args.quality.shifts.length === 0) {
    return { kind: 'VLM_ELIGIBLE', reason: 'unrecognized' };
  }
  if (args.diagnosisState === 'BLOCKED' || args.diagnosisState === 'UNSUPPORTED') {
    return { kind: 'VLM_ELIGIBLE', reason: 'blocked-diagnosis' };
  }
  if (args.quality.state === 'CORRECT' && args.quality.shifts.length > 0) {
    return { kind: 'VLM_NOT_ELIGIBLE', reason: 'reliable-result' };
  }
  return { kind: 'DETERMINISTIC_OK' };
}
