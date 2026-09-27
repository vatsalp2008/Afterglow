import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

// The rooms server. Phase 6 attaches the Yjs websocket handler to this server;
// for now it only answers health checks for the deploy platform.
function handle(req: IncomingMessage, res: ServerResponse): void {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404);
  res.end();
}

export function createRealtimeServer(): Server {
  return createServer(handle);
}
