import { describe, expect, it } from 'vitest';
import { geminiModel } from './gemini.ts';
import { RefineError } from './refine.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

/** A fetch that records its request and answers with `status` and `body`. */
function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const f: typeof fetch = (url, init) => {
    calls.push({ url: url instanceof Request ? url.url : url.toString(), init: init ?? {} });
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers }));
  };
  return { fetch: f, calls };
}

const answer = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });
const signal = new AbortController().signal;

describe('geminiModel', () => {
  it('sends the image and a JSON schema, with the key in a header', async () => {
    const { fetch, calls } = fakeFetch(200, answer('{"title":"a cat","paths":[]}'));
    const result = await geminiModel({ apiKey: 'key-123', model: 'gemini-test', fetch }).refine(PNG, signal);
    expect(result).toEqual({ title: 'a cat', paths: [] });
    const [call] = calls;
    expect(call!.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
    expect(new Headers(call!.init.headers).get('x-goog-api-key')).toBe('key-123');
    expect(call!.url).not.toContain('key-123');
    const body = JSON.parse(call!.init.body as string) as {
      contents: Array<{ parts: Array<{ inlineData?: { mimeType: string; data: string } }> }>;
      generationConfig: { responseMimeType: string; responseJsonSchema: { required: string[] } };
    };
    expect(body.contents[0]!.parts[0]!.inlineData).toEqual({ mimeType: 'image/png', data: 'iVBORw==' });
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseJsonSchema.required).toEqual(['title', 'paths']);
  });

  it('passes on an answer that isn’t JSON as nothing, to be asked again', async () => {
    const { fetch } = fakeFetch(200, answer('Sure! Here is your art'));
    expect(await geminiModel({ apiKey: 'k', fetch }).refine(PNG, signal)).toBeNull();
  });

  it.each([
    [429, {}, 'rateLimited'],
    [400, { error: { message: 'API key not valid. Please pass a valid API key.' } }, 'notConfigured'],
    [403, { error: { message: 'Permission denied' } }, 'notConfigured'],
    [503, { error: { message: 'Overloaded' } }, 'unavailable'],
    [200, { promptFeedback: { blockReason: 'SAFETY' } }, 'invalidOutput'],
  ])('turns HTTP %i into %s', async (status, body, kind) => {
    const { fetch } = fakeFetch(status, body, status === 429 ? { 'retry-after': '12' } : {});
    const err = await geminiModel({ apiKey: 'k', fetch })
      .refine(PNG, signal)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RefineError);
    expect((err as RefineError).kind).toBe(kind);
    if (status === 429) expect((err as RefineError).retryAfter).toBe(12);
  });

  it('reports a timeout when aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = (() => Promise.reject(new DOMException('aborted', 'AbortError'))) as typeof globalThis.fetch;
    const err = await geminiModel({ apiKey: 'k', fetch })
      .refine(PNG, controller.signal)
      .catch((e: unknown) => e);
    expect((err as RefineError).kind).toBe('timeout');
  });
});
