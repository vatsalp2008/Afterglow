import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { DEFAULT_GEMINI_MODEL, geminiModel } from './gemini.ts';
import { RateLimiter } from './rateLimit.ts';
import { RefineError, refineSketch, type RefineErrorKind, type RefineModel } from './refine.ts';

// The edge API: /refine (ADR 0016). It builds the app from options, so tests pass in a
// stand-in model; `appFromEnv` builds the real one. The runtime adapter is chosen with
// hosting in Phase 7; src/main.ts serves it with Node for development.

/** Strokes-only PNGs are a few hundred KB; anything bigger isn't one. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/** The whole refine, retry included, gets this long. */
export const REFINE_TIMEOUT_MS = 25_000;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface AppOptions {
  /** Null when no key is configured: /refine says so instead of failing obscurely. */
  model: RefineModel | null;
  limiter?: RateLimiter;
  /** Origins allowed to call the API from a browser (CORS). Same-origin needs none. */
  allowedOrigins?: readonly string[];
  timeoutMs?: number;
  log?: (entry: Record<string, unknown>) => void;
}

/** Bindings the runtime passes in: the client's address, for rate limiting. */
type Env = { Bindings: { remoteAddress?: string } };

const STATUS: Record<RefineErrorKind, 429 | 502 | 503 | 504> = {
  rateLimited: 429,
  notConfigured: 503,
  timeout: 504,
  unavailable: 502,
  invalidOutput: 502,
};

export function createApp(options: AppOptions): Hono<Env> {
  const limiter = options.limiter ?? new RateLimiter();
  const allowed = new Set(options.allowedOrigins ?? []);
  const timeoutMs = options.timeoutMs ?? REFINE_TIMEOUT_MS;
  const log = options.log ?? ((entry) => console.log(JSON.stringify(entry)));
  const app = new Hono<Env>();

  app.use('*', cors({ origin: (origin) => (allowed.has(origin) ? origin : null), allowMethods: ['GET', 'POST'] }));
  app.get('/health', (c) => c.json({ ok: true, refine: options.model !== null }));

  app.post(
    '/refine',
    bodyLimit({
      maxSize: MAX_IMAGE_BYTES,
      onError: (c) => c.json({ error: 'tooLarge', message: 'The image is larger than 2 MB' }, 413),
    }),
    async (c) => {
      const model = options.model;
      if (!model) return c.json({ error: 'notConfigured', message: 'Refine has no model key on this server' }, 503);
      if (c.req.header('content-type') !== 'image/png') {
        return c.json({ error: 'badImage', message: 'Send the drawing as image/png' }, 415);
      }
      const png = new Uint8Array(await c.req.arrayBuffer());
      if (png.length < 8 || PNG_SIGNATURE.some((b, i) => png[i] !== b)) {
        return c.json({ error: 'badImage', message: 'That isn’t a PNG' }, 400);
      }
      // Without a runtime (tests, some adapters) there are no bindings at all.
      const bindings = c.env as Env['Bindings'] | undefined;
      const client = bindings?.remoteAddress ?? 'unknown';
      const wait = limiter.take(client);
      if (wait > 0) {
        c.header('Retry-After', String(wait));
        return c.json({ error: 'rateLimited', message: 'Too many refines; try again soon' }, 429);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const t0 = performance.now();
      try {
        const { result, attempts } = await refineSketch(model, png, controller.signal);
        const modelMs = Math.round(performance.now() - t0);
        log({ route: 'refine', status: 200, model: model.name, modelMs, attempts, paths: result.paths.length });
        return c.json({ ...result, modelMs, attempts });
      } catch (err) {
        const modelMs = Math.round(performance.now() - t0);
        const refineError =
          err instanceof RefineError
            ? err
            : controller.signal.aborted
              ? new RefineError('timeout', 'Refine took too long')
              : new RefineError('unavailable', String(err));
        log({
          route: 'refine',
          status: STATUS[refineError.kind],
          error: refineError.kind,
          modelMs,
          detail: refineError.message,
        });
        if (refineError.retryAfter) c.header('Retry-After', String(refineError.retryAfter));
        return c.json({ error: refineError.kind, message: refineError.message }, STATUS[refineError.kind]);
      } finally {
        clearTimeout(timer);
      }
    },
  );
  return app;
}

/** The app as configured by environment variables (see .env.example). */
export function appFromEnv(env: Record<string, string | undefined>): Hono<Env> {
  const apiKey = env['GEMINI_API_KEY']?.trim();
  return createApp({
    model: apiKey ? geminiModel({ apiKey, model: env['GEMINI_MODEL']?.trim() || DEFAULT_GEMINI_MODEL }) : null,
    allowedOrigins: (env['ALLOWED_ORIGINS'] ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  });
}
