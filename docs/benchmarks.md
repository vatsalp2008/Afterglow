# Benchmarks

Measured results only. Each section says how to reproduce it, the hardware it ran on, and what the numbers don't cover.

## Hand tracking: main thread vs worker

This benchmark decided [ADR 0003](adr/0003-hand-tracking-in-a-worker.md).

**Reproduce:** `pnpm --filter @afterglow/web bench:tracker`, or add `-- --stress` for 500 strokes on screen. The script builds and serves the app and opens it in headless Chrome, with a fake webcam showing a real hand ([`e2e/assets`](../apps/web/e2e/assets)). It runs `?bench=tracker` and saves the raw results to [`benchmarks/data`](benchmarks/data). You can also run the benchmark by hand: start the studio with `?bench=tracker`, start the camera, and press **Run benchmark**.

**Method:**

- Four 10-second blocks on the same camera stream, alternating main thread, worker, main thread, worker. Each block starts with a 2-second warm-up.
- Each block creates a fresh tracker and closes it afterwards, so only one MediaPipe instance exists at a time.
- The studio keeps rendering throughout, including bloom.
- Latency runs from the frame's camera capture time until its landmarks reach the main thread.
- "Main" is the main-thread time spent per camera frame.
- "Slow" is the share of rendered frames that took longer than 25 ms, which shows as visible jank at 60 Hz.

**Setup:**

|          |                                                                     |
| -------- | ------------------------------------------------------------------- |
| Machine  | MacBook Pro (Mac15,7), Apple M3 Pro, macOS 26.6.2                   |
| Browser  | Chrome 155.0.8059.12, headless, WebGL via ANGLE Metal (real GPU)    |
| Model    | MediaPipe Tasks `HandLandmarker` 1.0.1, float16 model, GPU delegate |
| Input    | Chrome fake webcam, 640x480 at 30 fps, one static hand              |
| Viewport | 1440x900 at 1x                                                      |

### Results

Empty scene, from [`tracker-2026-09-27-23-27-27.json`](benchmarks/data/tracker-2026-09-27-23-27-27.json):

| Block | Tracker | fps  | Latency p50 / p95 (ms) | Inference p50 (ms) | Main p50 / p95 (ms) | Render p95 (ms) | Slow |
| ----- | ------- | ---- | ---------------------- | ------------------ | ------------------- | --------------- | ---- |
| 1     | main    | 30.0 | 25.7 / 32.8            | 14.9               | 14.9 / 20.9         | 16.8            | 0.0% |
| 2     | worker  | 30.0 | 34.8 / 48.3            | 21.4               | 0.3 / 0.4           | 16.8            | 0.0% |
| 3     | main    | 30.0 | 26.6 / 33.0            | 15.1               | 15.1 / 20.9         | 16.8            | 0.0% |
| 4     | worker  | 30.0 | 29.3 / 35.1            | 17.6               | 0.3 / 0.5           | 16.7            | 0.0% |

500 strokes on screen, from [`tracker-stress-2026-09-27-23-28-27.json`](benchmarks/data/tracker-stress-2026-09-27-23-28-27.json):

| Block | Tracker | fps  | Latency p50 / p95 (ms) | Inference p50 (ms) | Main p50 / p95 (ms) | Render p95 (ms) | Slow  |
| ----- | ------- | ---- | ---------------------- | ------------------ | ------------------- | --------------- | ----- |
| 1     | main    | 30.0 | 26.5 / 31.1            | 14.0               | 14.0 / 17.0         | 16.8            | 0.0%  |
| 2     | worker  | 30.0 | 36.1 / 41.4            | 23.5               | 0.2 / 0.4           | 16.7            | 0.0%  |
| 3     | main    | 30.0 | 28.4 / 46.6            | 15.7               | 15.7 / 31.5         | 33.3            | 13.4% |
| 4     | worker  | 30.0 | 34.6 / 41.9            | 22.9               | 0.2 / 0.4           | 16.8            | 0.0%  |

Three earlier runs of the same benchmark, before the script was committed, gave consistent results. Main-thread cost was 13–20 ms per frame. One main-thread block in six janked, with 24% slow frames. The worker's median latency was within about 5 ms of the main thread's in the empty scene and about 10 ms higher with 500 strokes, with 0% slow frames in every block.

### Reading the results

- **Main-thread inference takes 14–16 ms per camera frame** in these runs (13–20 ms across all runs), nearly a whole 60 Hz frame budget. Rendering usually absorbs it, but 2 of 10 main-thread blocks across all runs produced visible jank.
- **The worker removes that cost.** The main thread spends about 0.3 ms per frame (capturing an `ImageBitmap` and posting it), and no worker block janked.
- **The price is latency.** Inference in the worker takes longer (18–24 ms against 14–16 ms), because it shares the GPU with rendering and receives frames as bitmaps rather than reading the video texture directly. The median cost is up to about 10 ms more capture-to-landmark latency, most with a heavy scene.
- **Frame capture is cheap.** `createImageBitmap` of a 640x480 video frame measured under 0.1 ms.

### What these numbers don't cover

- A real webcam adds its own exposure and transfer delay before the capture timestamp is available. Real hands also trigger palm re-detection when tracking is lost, which a static image never does.
- Headless Chrome paces frames differently from a visible window. The benchmark panel runs the same measurement in a normal browser.
- These results come from one machine. Integrated or older GPUs will be slower.

### Earlier findings that changed the design

The first version of the benchmark kept both MediaPipe instances alive at once. In that setup inference slowed to 31–38 ms, and the main-thread tracker janked 85% of frames. The first worker version also accepted a new frame only after the previous result had returned, so it sat idle until the next camera frame: it ran at 15.6 fps and skipped 143 frames in one block. Two changes fixed this:

- the benchmark now keeps one instance at a time;
- the worker tracker has a one-slot mailbox, where the newest waiting frame starts as soon as the worker is free.

After both changes, the worker tracked every frame at 30 fps.
