# @afterglow/realtime

The rooms server. Node runs the TypeScript sources directly (type stripping, Node 22.18+), so there's no build step. Today it serves `GET /health`; Phase 6 adds the Yjs websocket server with persistence, room limits, and expiry.

```sh
pnpm --filter @afterglow/realtime dev   # PORT defaults to 1234
```
