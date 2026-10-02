import { describe, expect, it } from 'vitest';
import { appFromEnv, createApp, MAX_IMAGE_BYTES, type AppOptions } from './app.ts';
import { RateLimiter } from './rateLimit.ts';
import { RefineError, type RefineModel } from './refine.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const GOOD = { title: 'a house', paths: [{ d: 'M100 800 L100 400 L500 100 L900 400 L900 800 Z' }] };

/** A stand-in model answering from a script: one answer (or error) per call. */
function model(...answers: Array<unknown>): RefineModel & { calls: number } {
  const m = {
    name: 'test-model',
    calls: 0,
    refine: () => {
      const answer = answers[Math.min(m.calls++, answers.length - 1)];
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
  };
  return m;
}

const quiet = { log: () => undefined };
const app = (options: Partial<AppOptions> & Pick<AppOptions, 'model'>) => createApp({ ...quiet, ...options });
const refine = (a: ReturnType<typeof createApp>, body: Uint8Array = PNG, type = 'image/png', env = {}) =>
  a.request('/refine', { method: 'POST', headers: { 'content-type': type }, body }, env);

describe('api', () => {
  it('reports health, and whether refine is set up', async () => {
    const res = await app({ model: null }).request('/health');
    expect(await res.json()).toEqual({ ok: true, refine: false });
    expect((await app({ model: null }).request('/nope')).status).toBe(404);
  });

  it('refines a PNG into checked line art', async () => {
    const res = await refine(app({ model: model(GOOD) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ...GOOD, attempts: 1 });
  });

  it('asks once more when the answer isn’t valid, then gives up', async () => {
    const retried = model({ title: 'x', paths: [] }, GOOD);
    expect((await refine(app({ model: retried }))).status).toBe(200);
    expect(retried.calls).toBe(2);

    const hopeless = model({ title: 'x', paths: [{ d: 'not path data' }] });
    const res = await refine(app({ model: hopeless }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: 'invalidOutput' });
    expect(hopeless.calls).toBe(2);
  });

  it.each([
    [new RefineError('rateLimited', 'slow down', 30), 429, 'rateLimited'],
    [new RefineError('notConfigured', 'bad key'), 503, 'notConfigured'],
    [new RefineError('timeout', 'slow'), 504, 'timeout'],
    [new RefineError('unavailable', 'down'), 502, 'unavailable'],
    [new Error('surprise'), 502, 'unavailable'],
  ])('explains a model failure (%s)', async (failure, status, error) => {
    const res = await refine(app({ model: model(failure) }));
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ error });
    if (status === 429) expect(res.headers.get('retry-after')).toBe('30');
  });

  it('gives up on a model that takes too long', async () => {
    const stuck: RefineModel = {
      name: 'stuck',
      refine: (_, signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new RefineError('timeout', 'aborted'))),
        ),
    };
    const res = await refine(app({ model: stuck, timeoutMs: 20 }));
    expect(res.status).toBe(504);
  });

  it('accepts only PNGs, up to 2 MB', async () => {
    const a = app({ model: model(GOOD) });
    expect((await refine(a, PNG, 'image/jpeg')).status).toBe(415);
    expect((await refine(a, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).status).toBe(400);
    const huge = new Uint8Array(MAX_IMAGE_BYTES + 1);
    huge.set(PNG);
    expect((await refine(a, huge)).status).toBe(413);
  });

  it('limits each client’s refines', async () => {
    const a = app({ model: model(GOOD), limiter: new RateLimiter({ perMinute: 2, perDay: 10 }) });
    const me = { remoteAddress: '10.0.0.1' };
    expect((await refine(a, PNG, 'image/png', me)).status).toBe(200);
    expect((await refine(a, PNG, 'image/png', me)).status).toBe(200);
    const limited = await refine(a, PNG, 'image/png', me);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await refine(a, PNG, 'image/png', { remoteAddress: '10.0.0.2' })).status).toBe(200);
  });

  it('allows only its own origins from a browser', async () => {
    const a = app({ model: null, allowedOrigins: ['https://afterglow.example'] });
    const ok = await a.request('/health', { headers: { origin: 'https://afterglow.example' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://afterglow.example');
    const other = await a.request('/health', { headers: { origin: 'https://elsewhere.example' } });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('says refine isn’t set up without a key', async () => {
    const res = await refine(appFromEnv({}));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'notConfigured' });
  });
});
