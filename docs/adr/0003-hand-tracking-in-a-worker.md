# 0003: Run hand tracking in a Web Worker

- Status: accepted
- Date: 2026-09-27

## Context

MediaPipe's `HandLandmarker` runs once per camera frame at 30 fps. On the main thread, `detectForVideo` blocks until the landmarks are read back from the GPU. The main thread also runs the render loop, which has a 16.7 ms budget at 60 Hz. Phase 3 has to hold 60 FPS with 500 strokes on screen, so every millisecond of blocking work counts.

`@mediapipe/tasks-vision` 1.0.1 can run in a module worker: its loader falls back from `importScripts` to `import()`, and `FilesetResolver.forVisionTasks(base, true)` selects the ES-module WASM build. The GPU delegate then uses an internal `OffscreenCanvas`, which the library enables on Safari 17 and later.

The question was whether moving inference off the main thread is worth the transfer overhead.

## Decision

**Run inference in a Web Worker by default, and fall back to the main thread automatically.**

- **Frame flow:** each camera frame (driven by `requestVideoFrameCallback`) becomes an `ImageBitmap`, which is transferred to the worker. The worker runs `detectForVideo` and posts back plain landmark data.
- **One frame in flight, plus a one-slot mailbox:** the newest frame that arrives while the worker is busy waits, replacing any older waiting frame, and starts as soon as the worker is free. Latency can't build up, and the worker never sits idle waiting for the next camera frame.
- **Fallback:** if `Worker` or `OffscreenCanvas` is unavailable, or the worker fails to start, `createHandTracker` falls back to `MainThreadHandTracker` behind the same `HandTracker` interface. The fallback and its copy of MediaPipe are downloaded only in that case.
- **Override:** `?tracker=main` forces the main thread, for comparison.

## Evidence

Measured on an Apple M3 Pro with Chrome 155 and the real GPU. Full method, raw data, and caveats are in [benchmarks.md](../benchmarks.md#hand-tracking-main-thread-vs-worker).

|                                                                     | Main thread | Worker     |
| ------------------------------------------------------------------- | ----------- | ---------- |
| Tracking rate                                                       | 30 fps      | 30 fps     |
| Main-thread time per frame (p50)                                    | 13–20 ms    | 0.2–0.3 ms |
| Blocks with visible render jank (more than 0% of frames over 25 ms) | 2 of 10     | 0 of 10    |
| Capture-to-landmark latency (p50), empty scene                      | 26–33 ms    | 27–35 ms   |
| Capture-to-landmark latency (p50), 500 strokes                      | 25–28 ms    | 34–36 ms   |

## Alternatives considered

- **Main-thread inference.** Its median latency is up to about 10 ms lower, but it spends nearly a full frame budget of main-thread time on every camera frame, and it produced visible jank. That jank would get worse as the studio adds main-thread work: long-stroke geometry, UI updates, and later Yjs sync.
- **Transfer a `VideoFrame` instead of an `ImageBitmap`.** Capturing an `ImageBitmap` already costs under 0.1 ms, so there's nothing to gain, and `VideoFrame` support is narrower.
- **Also move rendering to a worker with `OffscreenCanvas`.** That would free the main thread further, but it's a larger change affecting DOM cursors, exports, and `MediaRecorder`. Revisit in Phase 3 if main-thread time becomes the bottleneck.

## Consequences

- Median input latency rises by up to about 10 ms, most when the GPU is busy rendering, because the worker's inference shares the GPU with the renderer. Phase 3 can reduce GPU contention, for example by rendering bloom at lower resolution, and should re-run `bench:tracker` afterwards.
- The main thread is left free for rendering and interaction.
- Browsers without worker `OffscreenCanvas` support, including Safari before 17, get main-thread tracking with no code changes.
- MediaPipe loads inside the worker, so the app's own chunks stay small. The camera entry is under 2 KB gzipped.
- Re-run `pnpm --filter @afterglow/web bench:tracker` whenever tracking, rendering, or MediaPipe versions change, and update this ADR if the balance shifts.
