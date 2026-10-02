// Refine's model: Google's Gemini, through its REST API (ADR 0016). No SDK: one request
// shape, plain fetch, so the API stays small and runs anywhere fetch does. The key never
// leaves the server.

import { REFINE_JSON_SCHEMA, REFINE_PROMPT, RefineError, type RefineModel } from './refine.ts';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

/** Seconds from a "Retry-After" header, if it holds a number. */
function retryAfter(res: Response): number | null {
  const v = Number(res.headers.get('retry-after'));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function geminiModel(options: GeminiOptions): RefineModel {
  const model = options.model ?? DEFAULT_GEMINI_MODEL;
  const doFetch = options.fetch ?? fetch;
  return {
    name: model,
    async refine(png, signal) {
      const body = {
        contents: [
          {
            role: 'user',
            parts: [{ inlineData: { mimeType: 'image/png', data: base64(png) } }, { text: REFINE_PROMPT }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: REFINE_JSON_SCHEMA,
          temperature: 0.4,
        },
      };
      let res: Response;
      try {
        res = await doFetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': options.apiKey },
          body: JSON.stringify(body),
          signal,
        });
      } catch (err) {
        if (signal.aborted) throw new RefineError('timeout', 'Gemini took too long');
        throw new RefineError('unavailable', `Gemini couldn't be reached: ${String(err)}`);
      }
      const data = (await res.json().catch(() => ({}))) as GeminiResponse;
      if (res.status === 429) throw new RefineError('rateLimited', 'Gemini is rate limiting', retryAfter(res));
      // A missing or wrong key comes back as 400 INVALID_ARGUMENT ("API key not valid"), 401 or 403.
      if (res.status === 401 || res.status === 403 || /api key/i.test(data.error?.message ?? '')) {
        throw new RefineError('notConfigured', `Gemini refused the key: ${data.error?.message ?? res.status}`);
      }
      if (!res.ok)
        throw new RefineError('unavailable', `Gemini answered ${String(res.status)}: ${data.error?.message ?? ''}`);
      if (data.promptFeedback?.blockReason) {
        throw new RefineError('invalidOutput', `Gemini declined the sketch (${data.promptFeedback.blockReason})`);
      }
      const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
      try {
        return JSON.parse(text) as unknown;
      } catch {
        // Not JSON: the caller treats it as invalid output and asks again.
        return null;
      }
    },
  };
}
