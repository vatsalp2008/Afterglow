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

## Input pipeline on the recorded fixtures (Phase 2)

These results decided [ADR 0004](adr/0004-hand-identity-by-position.md) and [ADR 0005](adr/0005-pinch-detection.md).

**Reproduce:**

- `pnpm --filter @afterglow/fixtures eval`: the scoreboard for the current defaults.
- `eval --tune`: the pinch parameter sweep.
- `eval --filters`: the filter comparison.

Everything is computed offline from the 8 recordings in [`fixtures/sessions`](../fixtures/sessions), scored against [`fixtures/labels.json`](../fixtures/labels.json). The golden snapshots in [`fixtures/golden`](../fixtures/golden) lock the results in CI.

**Data:** 8 sessions by one person, recorded in Safari 26.6 on the M3 Pro's built-in camera at 640x480, with 22–30 fps tracking. They include two deliberately hard cases, low light (`07`) and wrist rotation (`08`). That's a small dataset, so treat the numbers as a regression baseline, not a population estimate.

**Metrics:**

- **Recall** is the share of labeled pinched time during which the pen was down.
- **Precision** is the share of pen-down time that was really pinched.
- Both are time-weighted per frame.
- **Broken strokes** are strokes beyond the labeled count, per minute of labeled pinching.

### Stroke detection, before and after

"Phase 1" is the pipeline as it was: hands keyed by MediaPipe's label, tip-to-tip pinch at 0.25/0.35, One Euro (1.2, 8). "Phase 2" is the current default: identity by position, the mix pinch measure, 0.24/0.38, 3 release frames, a 250 ms rejoin window, and One Euro (0.3, 16).

| Fixture                | Correct | Phase 1 strokes | Phase 1 recall | Phase 2 strokes | Phase 2 recall | Phase 2 precision |
| ---------------------- | ------- | --------------- | -------------- | --------------- | -------------- | ----------------- |
| `01-still-hand`        | 0       | 0               | 1.00           | 0               | 1.00           | 1.00              |
| `02-slow-circles`      | 1       | 1               | 0.99           | 1               | 0.99           | 1.00              |
| `03-fast-zigzag`       | 1       | 7               | 0.79           | **1**           | **0.98**       | 1.00              |
| `04-pinch-on-off`      | 7       | 7               | 0.89           | 7               | 0.90           | 0.83              |
| `05-hand-leaves-frame` | 2       | 3               | –              | 4               | –              | –                 |
| `06-two-hands`         | 2 hands | 5 (2 hands)     | –              | 4 (2 hands)     | –              | –                 |
| `07-low-light`         | 1       | 0               | 0.00           | 4               | **0.32**       | 1.00              |
| `08-rotated-hand`      | 1       | 4               | 0.38           | 4               | 0.45           | 1.00              |

| Summary                                                       | Phase 1 | Phase 2   |
| ------------------------------------------------------------- | ------- | --------- |
| Mean pen-state F1 (labeled fixtures)                          | 0.721   | **0.826** |
| Broken strokes per minute of pinching, clean fixtures (02–04) | 14.7    | **0.0**   |
| Broken strokes per minute of pinching, all labeled fixtures   | 12.1    | 8.1       |

What changed, and what didn't:

- **Fast motion is fixed.** `03` now draws as one stroke covering 98% of the pinch.
- **Low light now draws, but poorly.** `07` goes from never drawing to drawing 32% of the pinch, in 4 pieces.
- **Rotation improved only slightly** (38% to 45% coverage).
- **`05` got worse by one stroke**: 4 against a correct 2, where Phase 1 gave 3.

These gaps are tracked as expected failures in the golden tests, and the world-landmark experiment in milestone B targets them.

### Pinch parameters

Sweeping 3,264 configurations showed a real trade-off. The strictest start thresholds minimize stroke-count errors, but they draw less: they can't re-close once the signal drifts in rotation or low light. Across every error level, a rejoin window improved coverage (mean F1 0.675 → 0.705 at 1 error, 0.780 → 0.809 at 4 errors).

The defaults are the middle of a stable region. With segment weight 1.2, 3 release frames, and a 250 ms rejoin window, every start threshold from 0.18 to 0.28 gives zero stroke errors on the clean fixtures, with release thresholds of 0.35 to 0.40. A time-based release (66–150 ms) performed within noise of a 3-frame release at these frame rates, so the simpler frame count is kept.

### Smoothing filters

Jitter is measured on `01-still-hand` while it's held still (2.5–9.9 s): RMS of the pen point around its 1 s moving average, in px at 640x480. Lag is the delay that best aligns each filtered track with the raw track on `03-fast-zigzag`.

| Filter                          | Jitter (px) | Lag (ms) |
| ------------------------------- | ----------- | -------- |
| None (raw MediaPipe)            | 0.44        | 0        |
| EMA, τ 60 ms                    | 0.38        | 39       |
| EMA, τ 100 ms                   | 0.34        | 59       |
| Kalman, q 0.0005, r 1e-4        | 0.31        | 145      |
| Kalman, q 0.002, r 1e-4         | 0.39        | 115      |
| One Euro 1.2 / 8 (Phase 1)      | 0.30        | 26       |
| **One Euro 0.3 / 16 (default)** | **0.24**    | **20**   |
| One Euro 0.3 / 32               | 0.28        | 13       |

- **MediaPipe's own output is already steady**, at under half a pixel on a still hand.
- **One Euro gives the best trade-off by a wide margin**: 45% less jitter for 20 ms of lag.
- **A constant-velocity Kalman fits hand motion poorly.** Smoothing comparably costs 115–145 ms, and it overshoots a sudden stop by 27%. This is shown in its unit tests.
- **The first version of this metric was misleading.** It included the hand entering the frame, which showed smoothing as _adding_ jitter. Restricting it to the labeled still stretch fixed that.
