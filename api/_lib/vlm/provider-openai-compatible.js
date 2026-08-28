/**
 * VLM fallback (server): OpenAI-compatible chat/completions provider.
 *
 * Design decision — response_format: we send `json_object` (not
 * `json_schema`). Strict `json_schema` structured outputs are NOT uniformly
 * supported across OpenAI-compatible gateways (the repo's only VLM precedent,
 * proxy-server.mjs, used json_object for the same reason), so the strictness
 * lives in the prompt + validateVlmExtraction instead of the wire format.
 *
 * All pages of one document go in a single request as multiple `image_url`
 * parts (data URIs), matching the proxy-server.mjs precedent.
 *
 * Security: the API key and the base64 payloads are NEVER logged; upstream
 * error bodies are discarded (they may echo request content).
 */
import { buildVlmPrompt } from './prompt.js';
import { VlmError, DEFAULT_VLM_TIMEOUT_MS } from './provider.js';
import { validateVlmExtraction } from './schema.js';

/** Tolerates ```json fences and surrounding prose; returns null when no
 * parseable JSON object is present. */
function extractJson(content) {
  let text = String(content ?? '').trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) {
    text = fenced[1].trim();
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function toUsage(rawUsage) {
  if (!rawUsage || typeof rawUsage !== 'object') {
    return null;
  }
  const usage = {};
  if (Number.isFinite(rawUsage.prompt_tokens)) {
    usage.inputTokens = rawUsage.prompt_tokens;
  }
  if (Number.isFinite(rawUsage.completion_tokens)) {
    usage.outputTokens = rawUsage.completion_tokens;
  }
  return Object.keys(usage).length > 0 ? usage : null;
}

export function createOpenAiCompatibleProvider(env = process.env) {
  return {
    name: 'openai-compatible',

    async analyze({ pages, hint = {}, timeoutMs = DEFAULT_VLM_TIMEOUT_MS, signal }) {
      const apiUrl = env.VLM_API_URL;
      const apiKey = env.VLM_API_KEY;
      const model = env.VLM_MODEL;
      if (!apiUrl || !apiKey || !model) {
        throw new VlmError('VLM_UNAVAILABLE', 503, 'VLM provider is not configured');
      }

      const { system, user } = buildVlmPrompt(hint);

      const controller = new AbortController();
      const onExternalAbort = () => controller.abort();
      if (signal) {
        if (signal.aborted) {
          controller.abort();
        } else {
          signal.addEventListener('abort', onExternalAbort, { once: true });
        }
      }
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response;
      try {
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: system },
              {
                role: 'user',
                content: [
                  ...pages.map((page) => ({
                    type: 'image_url',
                    image_url: {
                      url: `data:${page.mimeType};base64,${page.imageBase64}`,
                      detail: 'high',
                    },
                  })),
                  { type: 'text', text: user },
                ],
              },
            ],
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError') {
          throw new VlmError('VLM_TIMEOUT', 504, 'VLM provider request timed out');
        }
        throw new VlmError('VLM_PROVIDER_ERROR', 502, 'VLM provider request failed');
      } finally {
        clearTimeout(timer);
        if (signal) {
          signal.removeEventListener('abort', onExternalAbort);
        }
      }

      if (response.status === 429) {
        throw new VlmError('VLM_RATE_LIMITED', 429, 'VLM provider rate limit reached');
      }
      if (!response.ok) {
        throw new VlmError('VLM_PROVIDER_ERROR', 502, `VLM provider responded with HTTP ${response.status}`);
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new VlmError('VLM_INVALID_RESPONSE', 502, 'VLM provider returned a non-JSON envelope');
      }

      const parsed = extractJson(payload?.choices?.[0]?.message?.content);
      if (!parsed) {
        throw new VlmError('VLM_INVALID_RESPONSE', 502, 'VLM provider returned unparseable content');
      }
      const validation = validateVlmExtraction(parsed);
      if (!validation.ok) {
        throw new VlmError('VLM_INVALID_RESPONSE', 502, `VLM output failed schema validation: ${validation.reason}`);
      }

      return {
        records: validation.value,
        usage: toUsage(payload?.usage),
        provider: 'openai-compatible',
        model,
      };
    },
  };
}
