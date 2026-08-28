/**
 * VLM fallback (server): provider seam. The endpoint only ever talks to the
 * interface below; swapping vendors is a matter of env config, not code.
 *
 * Provider interface:
 *   analyze({
 *     pages: [{ imageBase64: string, mimeType: string }],
 *     hint: { month?: number, year?: number },
 *     timeoutMs: number,
 *     signal?: AbortSignal,
 *   }) → {
 *     records: object,   // extraction payload validated by validateVlmExtraction
 *     usage: { inputTokens?: number, outputTokens?: number } | null,
 *     provider: string,  // internal provider name (never exposed to clients)
 *     model: string,     // internal model id (never exposed to clients)
 *   }
 *
 * Errors: providers throw VlmError with a machine-readable `code` and a
 * suggested HTTP `status`:
 *   VLM_UNAVAILABLE       503  provider not configured / unknown provider kind
 *   VLM_TIMEOUT           504  the call exceeded timeoutMs
 *   VLM_RATE_LIMITED      429  the upstream provider throttled us
 *   VLM_INVALID_RESPONSE  502  output missing, unparseable or off-schema
 *   VLM_PROVIDER_ERROR    502  upstream 5xx / network failure
 */
import { createFakeVlmProvider } from './provider-fake.js';
import { createOpenAiCompatibleProvider } from './provider-openai-compatible.js';

export class VlmError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'VlmError';
    this.code = code;
    this.status = status;
  }
}

export const DEFAULT_VLM_TIMEOUT_MS = 30000;

/**
 * @param {Record<string, string | undefined>} env defaults to process.env.
 * `VLM_PROVIDER`: 'openai-compatible' (default) | 'fake'.
 */
export function createVlmProvider(env = process.env) {
  const kind = env.VLM_PROVIDER || 'openai-compatible';
  switch (kind) {
    case 'openai-compatible':
      return createOpenAiCompatibleProvider(env);
    case 'fake':
      return createFakeVlmProvider(env);
    default:
      throw new VlmError('VLM_UNAVAILABLE', 503, `Unknown VLM provider: ${kind}`);
  }
}
