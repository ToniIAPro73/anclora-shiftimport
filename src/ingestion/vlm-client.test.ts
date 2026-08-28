import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeWithVlmFallback, isVlmFallbackAvailable, setVlmFallbackSessionActive, VlmRecords } from './vlm-client';
import { rasterizeFileForVlm } from './vlm-raster';

// Rasterization is browser-only (canvas/pdf.js): mocked here so the client
// logic (payload, error mapping, dedup, abort) is tested against fetch only.
vi.mock('./vlm-raster', () => ({
  rasterizeFileForVlm: vi.fn(async () => [
    // 'AAAA' decodes to 3 bytes — far below the 4MB per-page budget.
    { imageBase64: 'AAAA', mimeType: 'image/png' as const },
  ]),
}));

const mockedRasterize = vi.mocked(rasterizeFileForVlm);

const RECORDS: VlmRecords = {
  employeeName: 'Ana Martinez',
  externalEmployeeId: null,
  areaName: null,
  entries: [
    { date: '2026-08-01', shiftType: 'Regular', startTime: '08:00', endTime: '16:00', notes: null },
  ],
};

const makeFile = () => new File(['pdf-bytes'], 'cuadrante.pdf', { type: 'application/pdf', lastModified: 1000 });

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('vlm-client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    setVlmFallbackSessionActive(false);
  });

  describe('session availability flag', () => {
    it('defaults to unavailable and follows the setter', () => {
      expect(isVlmFallbackAvailable()).toBe(false);
      setVlmFallbackSessionActive(true);
      expect(isVlmFallbackAvailable()).toBe(true);
    });
  });

  it('sends rasterized pages with context and returns the records', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { records: RECORDS, usage: null, provider: 'vlm', engine: 'vlm-fallback' }));
    const outcome = await analyzeWithVlmFallback(makeFile(), { month: 8, year: 2026 });

    expect(outcome).toEqual({ ok: true, records: RECORDS });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/ingestion/vlm');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body)) as { pages: unknown[]; context: { month: number; year: number } };
    expect(body.pages).toHaveLength(1);
    expect(body.context).toEqual({ month: 8, year: 2026 });
  });

  it('maps 429 to VLM_RATE_LIMITED', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, { error: 'rate', code: 'VLM_RATE_LIMITED' }));
    expect(await analyzeWithVlmFallback(makeFile())).toEqual({ ok: false, code: 'VLM_RATE_LIMITED' });
  });

  it('maps 504 to VLM_TIMEOUT', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(504, { error: 'timeout', code: 'VLM_TIMEOUT' }));
    expect(await analyzeWithVlmFallback(makeFile())).toEqual({ ok: false, code: 'VLM_TIMEOUT' });
  });

  it('maps 503 to VLM_UNAVAILABLE', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(503, { error: 'down', code: 'VLM_UNAVAILABLE' }));
    expect(await analyzeWithVlmFallback(makeFile())).toEqual({ ok: false, code: 'VLM_UNAVAILABLE' });
  });

  it('maps a non-JSON error body to VLM_PROVIDER_ERROR', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }));
    expect(await analyzeWithVlmFallback(makeFile())).toEqual({ ok: false, code: 'VLM_PROVIDER_ERROR' });
  });

  it('maps a 200 with a malformed payload to VLM_INVALID_RESPONSE', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { records: { employeeName: 'X' } }));
    expect(await analyzeWithVlmFallback(makeFile())).toEqual({ ok: false, code: 'VLM_INVALID_RESPONSE' });
  });

  it('maps a network failure to VLM_UNAVAILABLE', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await analyzeWithVlmFallback(makeFile())).toEqual({ ok: false, code: 'VLM_UNAVAILABLE' });
  });

  it('short-circuits oversized pages without calling fetch', async () => {
    // 6MB of zero bytes, base64-encoded.
    mockedRasterize.mockResolvedValueOnce([
      { imageBase64: Buffer.alloc(6 * 1024 * 1024).toString('base64'), mimeType: 'image/png' },
    ]);
    expect(await analyzeWithVlmFallback(makeFile())).toEqual({ ok: false, code: 'VLM_FILE_TOO_LARGE' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('dedupes concurrent calls for the same file into a single request', async () => {
    let release!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>((resolve) => {
      release = resolve;
    }));

    const first = analyzeWithVlmFallback(makeFile());
    const second = analyzeWithVlmFallback(makeFile());
    // Rasterization runs before fetch: wait until the request is in flight.
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    release(jsonResponse(200, { records: RECORDS }));

    expect(await first).toEqual({ ok: true, records: RECORDS });
    expect(await second).toEqual({ ok: true, records: RECORDS });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('propagates AbortError and never reaches fetch when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(analyzeWithVlmFallback(makeFile(), { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
