# Afterglow

Paint with light, using your hands. Afterglow is a real-time, in-browser light-painting studio: point at your webcam, pinch your fingers, and draw glowing trails like long-exposure photography.

Video from your camera is processed on your device and never uploaded.

## Run it

Requires Node 22.18+ and pnpm 11.

```sh
pnpm install
pnpm dev
```

Open the URL Vite prints in Chrome or Edge. How to paint, and every keyboard shortcut, are in [`apps/web`](apps/web).

## Repository

| Path                                     | What it is                                                     |
| ---------------------------------------- | -------------------------------------------------------------- |
| [`apps/web`](apps/web)                   | The studio (Vite + React)                                      |
| [`apps/api`](apps/api)                   | Edge API                                                       |
| [`apps/realtime`](apps/realtime)         | Rooms server                                                   |
| [`packages/core`](packages/core)         | Pure pipeline logic: filters, gestures, strokes, history       |
| [`packages/tracking`](packages/tracking) | Camera and MediaPipe hand tracking                             |
| [`packages/render`](packages/render)     | Three.js light renderer                                        |
| [`packages/ui`](packages/ui)             | Design tokens and UI primitives                                |
| [`packages/collab`](packages/collab)     | Shared rooms (Yjs)                                             |
| [`ml`](ml)                               | Doodle recognizer training (Python)                            |
| [`docs`](docs)                           | [Architecture](docs/architecture.md) and [decisions](docs/adr) |

## Checks

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
cd ml && uv sync && uv run ruff check . && uv run mypy && uv run pytest
```

CI runs all of these on every push and pull request.

## Status

Built phase by phase; see [`PLAN.md`](PLAN.md) for the roadmap and current status.
