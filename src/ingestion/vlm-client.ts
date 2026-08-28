/**
 * Client for the server-side VLM fallback (POST /api/ingestion/vlm).
 *
 * The endpoint is authenticated and org-scoped, so the fallback is only
 * offered when the app has an active session: App.tsx feeds that state in
 * via setVlmFallbackSessionActive and the pipeline gates on
 * isVlmFallbackAvailable().
 *
 * Failures are values, not exceptions ({ ok: false, code }) — the import
 * pipeline must degrade to the deterministic result, never crash on a
 * fallback outage. The only exception that escapes is AbortError (the user
 * cancelled the analysis). No base64 payloads are ever logged.
 */
import { isVlmErrorCode, VlmErrorCode } from '../lib/ingestion-errors';
import { rasterizeFileForVlm } from './vlm-raster';

export interface VlmEntry {
  date: string;
  shiftType: string | null;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
}

export interface VlmRecords {
  employeeName: string | null;
  externalEmployeeId: string | null;
  areaName: string | null;
  entries: VlmEntry[];
}

export type VlmFallbackOutcome =
  | { ok: true; records: VlmRecords }
  | { ok: false; code: VlmErrorCode };

export interface VlmFallbackOptions {
  /** 1-12; the user's selected month is authoritative context for the VLM. */
  month?: number;
  year?: number;
  signal?: AbortSignal;
}

/** Endpoint contract: ≤ 4MB decoded per page. */
const MAX_PAGE_BYTES = 4 * 1024 * 1024;
const ENDPOINT = '/api/ingestion/vlm';

// Session availability is app-level state: the ingestion pipeline has no
// access to React context, so App.tsx pushes it here on session resolution
// (login/logout/org switch included).
let sessionActive = false;

export function setVlmFallbackSessionActive(active: boolean): void {
  sessionActive = active;
}

export function isVlmFallbackAvailable(): boolean {
  return sessionActive;
}

const abortError = (): DOMException => new DOMException('The VLM analysis was aborted.', 'AbortError');

/** Decoded byte size of a canonical base64 string. */
const decodedSize = (base64: string): number => {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
};

const fileFingerprint = (file: File): string => `${file.name}:${file.size}:${file.lastModified}`;

// In-flight dedup: two concurrent analyses of the same file share one
// request (and the first caller's abort signal).
const inFlight = new Map<string, Promise<VlmFallbackOutcome>>();

const mapHttpError = (status: number, bodyCode: unknown): VlmErrorCode => {
  if (isVlmErrorCode(bodyCode)) {
    return bodyCode;
  }
  switch (status) {
    case 429:
      return 'VLM_RATE_LIMITED';
    case 503:
      return 'VLM_UNAVAILABLE';
    case 504:
      return 'VLM_TIMEOUT';
    default:
      // 400 (our payload was rejected — a client bug), 401 (session lost
      // mid-flight), 502 without a known code, ...: all surface the same.
      return 'VLM_PROVIDER_ERROR';
  }
};

const isValidRecords = (records: unknown): records is VlmRecords =>
  typeof records === 'object'
  && records !== null
  && Array.isArray((records as { entries?: unknown }).entries);

async function runVlmAnalysis(file: File, opts: VlmFallbackOptions): Promise<VlmFallbackOutcome> {
  if (opts.signal?.aborted) {
    throw abortError();
  }

  let pages;
  try {
    pages = await rasterizeFileForVlm(file);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    // Rasterization failures (corrupt file, no canvas) degrade like any
    // other fallback outage: the deterministic result stands.
    return { ok: false, code: 'VLM_PROVIDER_ERROR' };
  }

  if (pages.length === 0 || pages.some((page) => decodedSize(page.imageBase64) > MAX_PAGE_BYTES)) {
    return { ok: false, code: 'VLM_FILE_TOO_LARGE' };
  }

  const context: { month?: number; year?: number } = {};
  if (opts.month !== undefined) {
    context.month = opts.month;
  }
  if (opts.year !== undefined) {
    context.year = opts.year;
  }

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        pages,
        ...(opts.month !== undefined || opts.year !== undefined ? { context } : {}),
      }),
      signal: opts.signal ?? null,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    // Network-level failure (offline, DNS, dev server down).
    return { ok: false, code: 'VLM_UNAVAILABLE' };
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = typeof payload === 'object' && payload !== null
      ? (payload as { code?: unknown }).code
      : undefined;
    return { ok: false, code: mapHttpError(response.status, code) };
  }
  if (typeof payload !== 'object' || payload === null || !isValidRecords((payload as { records?: unknown }).records)) {
    return { ok: false, code: 'VLM_INVALID_RESPONSE' };
  }
  return { ok: true, records: (payload as { records: VlmRecords }).records };
}

/**
 * Rasterizes the document and asks the server-side VLM for a structured
 * extraction. Concurrent calls for the same file are deduplicated to a
 * single request. Rejects with AbortError only when aborted.
 */
export function analyzeWithVlmFallback(file: File, opts: VlmFallbackOptions = {}): Promise<VlmFallbackOutcome> {
  const key = fileFingerprint(file);
  const pending = inFlight.get(key);
  if (pending) {
    return pending;
  }
  const promise = runVlmAnalysis(file, opts).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}
