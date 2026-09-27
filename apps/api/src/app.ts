import { Hono } from 'hono';

// The edge API. Phase 5 adds /refine; the runtime adapter (Workers or Vercel)
// is chosen then, so this module only builds the app.
export const app = new Hono();

app.get('/health', (c) => c.json({ ok: true }));
