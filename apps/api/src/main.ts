// Serves the API with Node for development (`pnpm --filter @afterglow/api dev`, or the
// root `pnpm dev`): a small adapter from Node's http server to the app's fetch handler.
// Hosting picks its own adapter in Phase 7.

import { createServer, type IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { appFromEnv } from './app.ts';

const port = Number(process.env['PORT'] ?? 8787);
const app = appFromEnv(process.env);

function toRequest(req: IncomingMessage): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(name, v);
    else if (value !== undefined) headers.set(name, value);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, {
    method: req.method ?? 'GET',
    headers,
    ...(hasBody ? { body: Readable.toWeb(req) as ReadableStream<Uint8Array>, duplex: 'half' } : {}),
  });
}

createServer((req, res) => {
  void (async () => {
    try {
      const response = await app.fetch(toRequest(req), { remoteAddress: req.socket.remoteAddress });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) for await (const chunk of response.body) res.write(chunk);
      res.end();
    } catch (err) {
      console.error('[api] request failed', err);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal' }));
    }
  })();
}).listen(port, '127.0.0.1', () => {
  const refine = process.env['GEMINI_API_KEY']
    ? 'Gemini key found'
    : 'no GEMINI_API_KEY: /refine will say it isn’t set up';
  console.log(`[api] http://127.0.0.1:${String(port)} (${refine})`);
});
