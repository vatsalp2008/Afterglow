import { createRealtimeServer } from './server.ts';

const port = Number(process.env['PORT'] ?? 1234);

createRealtimeServer().listen(port, () => {
  console.log(`[realtime] listening on http://localhost:${String(port)}`);
});
