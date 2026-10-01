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

## Rendering (Phase 3)

These results decided [ADR 0010](adr/0010-light-rendering.md).

**Reproduce:** `pnpm --filter @afterglow/web build && pnpm --filter @afterglow/web bench:render [-- --label NAME]`. It serves the production build and runs `?bench=render` in headless Chrome. The raw results are in [`benchmarks/data/render-*.json`](benchmarks/data).

|          |                                                                              |
| -------- | ---------------------------------------------------------------------------- |
| Machine  | MacBook Pro (Mac15,7), Apple M3 Pro                                          |
| Browser  | Chrome, headless, WebGL via ANGLE Metal (real GPU)                           |
| Viewport | 1440x900 at pixel ratio 2 (the studio's cap), fade off                       |
| Strokes  | `?stress=N`: 20 to 200 points each, sampled every 16 to 33 ms, mixed brushes |

**Method:**

- **Frame interval** is the time between animation frames. Headless Chrome caps it at 60 Hz, so it shows missed frames, not headroom.
- **CPU** is the time spent in each frame: syncing strokes, rendering, cursors.
- **CPU + GPU** renders each frame and then reads back one pixel, which waits for the GPU to finish. That is the real cost, and the headroom under 16.7 ms.
- **Draw calls** count every pass in the frame.

### Frame cost as the canvas fills

"Before" is the code at the start of Phase 3, and "after" its end. Neither batches strokes. The difference is within run-to-run noise.

| Strokes | Draw calls | Before: CPU p95 | Before: CPU + GPU p95 | After: CPU p95 | After: CPU + GPU p95 | Slow frames |
| ------- | ---------- | --------------- | --------------------- | -------------- | -------------------- | ----------- |
| 0       | 16         | 1.0 ms          | 8.8 ms                | 1.0 ms         | 8.7 ms               | 0%          |
| 100     | 116        | 1.6 ms          | 9.5 ms                | 1.4 ms         | 9.8 ms               | 0%          |
| 250     | 266        | 1.7 ms          | 9.2 ms                | 1.9 ms         | 11.3 ms              | 0%          |
| 500     | 516        | 2.4 ms          | 11.6 ms               | 2.9 ms         | 12.1 ms              | 0%          |
| 1000    | 1016       | 1.8 ms          | 12.6 ms               | 1.8 ms         | 12.4 ms              | 0%          |

- **The gate is met: 500 strokes at 60 FPS with no slow frames,** and even 1000 strokes use 12.4 ms of the 16.7 ms frame.
- **Most of the cost is fixed:** bloom and the darkroom composite at full Retina resolution take 8.7 ms on an empty canvas.
- **A thousand draw calls cost under 2 ms of CPU,** so batching strokes isn't worth its complexity yet.

### Other costs (after)

| Measure                                         | Result                               |
| ----------------------------------------------- | ------------------------------------ |
| Eraser dragged across 500 strokes, per step     | 0.4 ms p50, 7.2 ms p95 (20 steps)    |
| Frames right after each erase step (rebuilding) | 4.2 ms p95                           |
| Rebuilding a live stroke, once per input frame  | 0.1 ms at 500 points, 0.5 ms at 2000 |
| Moving and uploading all 4000 spark particles   | 0.1 ms a frame                       |

### Capture to ink on screen

Measured from the capture of the camera frame that changed the ink to the next animation frame after the render that drew it, which is when the ink is on screen. Only frames that change ink count.

The fake webcam's hand never pinches, so the full path can't be measured headlessly. It's measured in two halves:

| Part                                                                   | p50        | p95         |
| ---------------------------------------------------------------------- | ---------- | ----------- |
| Camera capture to landmarks on the main thread (worker tracker, above) | 29–35 ms   | 35–48 ms    |
| Landmarks to ink on screen (recording `03-fast-zigzag` played back)    | 28 ms      | 31 ms       |
| **Capture to ink**                                                     | **~60 ms** | **≤ 80 ms** |

- **The rendering half is about 1.5 display frames.** Input lands partway through a frame, the next frame draws it, and the one after shows it.
- **The total is a sum of the two halves.** The p95 total adds the two p95s, so it's an upper bound.
- **The live number with a real camera** is in the stats panel (H) as "Capture to ink on screen".

## Input pipeline on the recorded fixtures (Phase 2)

These results decided [ADR 0004](adr/0004-hand-identity-by-position.md) and [ADR 0005](adr/0005-pinch-detection.md).

**Reproduce:**

- `pnpm --filter @afterglow/fixtures eval`: the scoreboard for the current defaults.
- `eval --tune`: the pinch parameter sweep.
- `eval --filters`: the filter comparison.
- The Filter Lab (`/lab/` in the web app) shows the same jitter and lag for any recording and filter settings, with the signals plotted. An e2e test checks that it reproduces the numbers below.

Everything is computed offline from the 15 recordings in [`fixtures/sessions`](../fixtures/sessions), scored against [`fixtures/labels.json`](../fixtures/labels.json). The golden snapshots in [`fixtures/golden`](../fixtures/golden) lock the results in CI.

**Data:** 15 sessions by one person, recorded in Safari 26.6 on the M3 Pro's built-in camera at 640x480, with 19–30 fps tracking.

- They include hard cases: low light (`07`, `14`) and wrist rotation (`08`, `15`).
- Six never pinch: a still hand, a relaxed hand, an open palm, a fist, two-finger swipes, and a two-hand frame (`01`, `09`–`13`).

That's a small dataset, so treat the numbers as a regression baseline, not a population estimate.

**Metrics:**

- **Recall** is the share of labeled pinched time during which the pen was down.
- **Precision** is the share of pen-down time that was really pinched.
- Both are time-weighted per frame.
- **Broken strokes** are strokes beyond the labeled count, per minute of labeled pinching.

### Stroke detection, before and after

"Phase 1" is the pipeline as it was: hands keyed by MediaPipe's label, tip-to-tip pinch at 0.25/0.35, One Euro (1.2, 8). "Current" is the default now:

- identity by position;
- the fingertip-pad pinch measure and the fist gate;
- the same thresholds for everyone, with no calibration: start below 0.30 for 3 frames, release above 0.40 for 100 ms, and a 250 ms rejoin window ([ADR 0007](adr/0007-no-calibration.md));
- One Euro (0.3, 16).

Recordings that pinch:

| Fixture                | Correct | Phase 1 strokes | Phase 1 recall | Current strokes | Current recall | Current precision |
| ---------------------- | ------- | --------------- | -------------- | --------------- | -------------- | ----------------- |
| `02-slow-circles`      | 1       | 1               | 0.99           | 1               | 0.99           | 1.00              |
| `03-fast-zigzag`       | 1       | 7               | 0.79           | **1**           | **0.97**       | 1.00              |
| `04-pinch-on-off`      | 7       | 7               | 0.89           | 7               | 0.88           | 0.82              |
| `05-hand-leaves-frame` | 2       | 3               | –              | **2**           | –              | –                 |
| `06-two-hands`         | 2 hands | 5 (2 hands)     | –              | 4 (2 hands)     | –              | –                 |
| `07-low-light`         | 1       | 0               | 0.00           | 0               | 0.00           | –                 |
| `08-rotated-hand`      | 1       | 4               | 0.38           | 3               | 0.47           | 1.00              |
| `14-low-light-2`       | 1       | 3               | 0.57           | **1**           | **0.95**       | 1.00              |
| `15-rotated-hand-2`    | 1       | 1               | 0.25           | 1               | 0.26           | 1.00              |

Recordings that never pinch. The pen should never go down. "Milestone A" is the first Phase 2 pipeline, which measured the thumb against two finger segments.

| Fixture           | Phase 1          | Milestone A      | Current |
| ----------------- | ---------------- | ---------------- | ------- |
| `01-still-hand`   | 0                | 0                | 0       |
| `09-relaxed-hand` | 0                | 1 stroke, 7.7 s  | 0       |
| `10-open-palm`    | 0                | 0                | 0       |
| `11-fist`         | 5 strokes, 3.7 s | 4 strokes, 9.2 s | 0       |
| `12-swipes`       | 0                | 0                | 0       |
| `13-frame`        | 0                | 0                | 0       |

| Summary                                                     | Phase 1 | Current   |
| ----------------------------------------------------------- | ------- | --------- |
| Mean pen-state F1 (13 labeled fixtures)                     | 0.727   | **0.835** |
| Broken strokes per minute of pinching, all held pinches     | 10.6    | **1.9**   |
| Broken strokes per minute, clean fixtures (`02`–`04`, `14`) | 15.3    | **0.0**   |
| Pen-down time on the fixtures that never pinch              | 3.7 s   | **0 s**   |

What changed, and what didn't:

- **Fast motion is fixed.** `03` draws as one stroke covering 97% of the pinch.
- **Nothing that isn't a pinch draws**, including a fist, where the thumb genuinely presses on the index finger.
- **The second low-light take works**: `14` draws as one stroke covering 95% of the pinch. The first take, `07`, draws nothing: its thumb pressed the side of the finger, which looks like a relaxed hand (ADR 0005).
- **Rotation is the largest gap** (26–47% coverage). MediaPipe's world landmarks don't help; ADR 0005 has the numbers.

These gaps are tracked as expected failures in the golden tests.

### Pinch parameters

The sweep covers 2,496 configurations: start thresholds from 0.18 to 0.36, with 2 or 3 frames to start, and release thresholds from 0.35 to 0.45. It ranks them by stroke-count errors, then by mean F1. A correct count whose strokes cover less than half the pinch still counts as an error: one short stroke isn't the stroke the user drew. Without that rule, the sweep preferred thresholds that avoid breaks only by drawing less, for example `08` as one stroke covering 11%.

Fewer errors and more coverage still pull against each other, so the sweep also prints the tradeoff front, the best mean F1 at each error count:

| Start | Frames to start | Release | Release timing | Rejoin | Errors | Mean F1         |
| ----- | --------------- | ------- | -------------- | ------ | ------ | --------------- |
| 0.18  | 3               | 0.42    | 4 frames       | none   | 3      | 0.797           |
| 0.27  | 2               | 0.45    | 100 ms         | 400 ms | 4      | 0.838           |
| 0.30  | 3               | 0.40    | 100 ms         | 250 ms | 4      | 0.835 (current) |

- **The defaults are chosen for other people's hands, not for the highest score** ([ADR 0007](adr/0007-no-calibration.md)). The start threshold is as loose as the recordings allow: at 0.30 a relaxed or open hand never draws, and neither does a hand closing into a fist, as long as the pen waits for 3 frames.
- **The 3-error row starts at 0.18**, well inside the recording author's own pinch range. That's the kind of fit that left other people unable to draw.
- **Release above 0.40 merges two of `04`'s pinches.** That's why the 0.45 row isn't used even though it scores higher: a user's separate strokes would join.
- **A 100 ms release** gets `03` right where a 3-frame release doesn't, and it doesn't depend on frame rate.

### Tool gestures

These results decided [ADR 0006](adr/0006-tool-gestures.md). Gestures are scored against labeled windows: each labeled gesture must be detected inside its window, and anything else detected is a false trigger.

| Recording                          | Labeled      | Detected | False triggers |
| ---------------------------------- | ------------ | -------- | -------------- |
| `11-fist`                          | 4 pauses     | 4        | 0              |
| `13-frame`                         | 3 refines    | 3        | 0              |
| `10-open-palm`                     | 3 menu opens | 1        | 1              |
| `12-swipes`                        | not labeled  | 3 redos  | –              |
| The 11 recordings without gestures | none         | none     | **0**          |

- **`10` falls short by design.** The palm never closes between raises, and a held pose fires once until it ends.
- **`12` can't be scored**, because it isn't known which of its moves were swipes and which were returns. ADR 0006 has both, and the re-record scenarios that fix them.
- **Nothing fires on any drawing recording**, including two hands drawing at once (`06`) and a hand leaving the frame (`05`).

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
