# Recorded hand sessions

Each file is one recorded session: the raw (unfiltered) hand landmarks MediaPipe produced for every camera frame, with capture timestamps. **Only the 21 landmark points per hand are stored, never images or video.**

Fixtures make the input pipeline testable without a camera. They drive the filter and gesture tests, the Filter Lab, the benchmarks, and end-to-end tests. Replay one in the studio with `?fixture=<name>`, for example `?fixture=04-pinch-on-off`.

## Format

`SessionRecording` from `packages/core/src/session.ts`, validated by `parseSessionRecording`:

- `version`: always `1`.
- `meta`: browser user agent, video size, measured tracking rate, tracker (`worker` or `main`) and delegate, recording time, and the scenario id and instructions.
- `frames`: `{ frameId, captureTime, hands }`, where `captureTime` is in milliseconds from the first frame. Each hand has a `key`, a `handedness` (already corrected for the mirrored view), a `score`, and 21 `landmarks` in MediaPipe's normalized image coordinates (unmirrored), rounded to 5 decimals.

## The recordings

Recorded on 2026-09-28 with the guided capture panel. Setup: Safari 26.6.2 on an Apple M3 Pro MacBook Pro, the built-in camera at 640x480, and the worker tracker on the GPU. Tracking ran at 22–30 fps. Safari reports timestamps at 1 ms resolution.

"Correct result" is what the pipeline should produce, confirmed against the recording and with the person who performed it. Machine-readable labels, including labeled pinch intervals, are in [`../labels.json`](../labels.json). "Phase 1 pipeline" is what the Phase 1 filter and pinch detector produced. Current results, as of Phase 2, are in [`docs/benchmarks.md`](../../docs/benchmarks.md) and locked by the golden snapshots in [`../golden`](../golden).

| File                        | Performed                                                                     | Correct result                             | Phase 1 pipeline                                     |
| --------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------- |
| `01-still-hand.json`        | One open hand held still, no pinch                                            | 0 strokes                                  | 0 strokes                                            |
| `02-slow-circles.json`      | Pinch, 3 slow circles, pinch held to the end                                  | 1 stroke                                   | 1 stroke                                             |
| `03-fast-zigzag.json`       | Pinch held through fast zigzags                                               | 1 stroke                                   | **7 strokes**: speed spikes the ratio past exit      |
| `04-pinch-on-off.json`      | 7 pinch-and-release cycles (the instruction said 5; the data shows 7 clearly) | 7 strokes                                  | 7 strokes                                            |
| `05-hand-leaves-frame.json` | Draw, leave the frame while pinched, return, draw again                       | A stroke ending with `handLost`, then more | 3 strokes, 1 ending with `handLost`                  |
| `06-two-hands.json`         | Both hands drawing, partly at the same time                                   | Strokes from 2 hands                       | 5 strokes from 2 hand keys; 6 handedness label swaps |
| `07-low-light.json`         | One slow line in a dim room, pinched firmly                                   | 1 stroke                                   | **0 strokes**: ratio never below 0.4, hand drops out |
| `08-rotated-hand.json`      | Pinch held while rotating the wrist sideways and down                         | 1 stroke                                   | **4 strokes**: ratio reads 0.5–0.7 as the palm turns |

## What the recordings revealed

- **Fast motion breaks strokes.** While the pinch is held, the ratio spikes from about 0.15 to 0.3–0.4 during quick moves, which crosses the exit threshold (0.35) for two frames (`03`).
- **Rotation inflates the pinch ratio.** With the palm turned away, MediaPipe's fingertip estimates separate even though the fingers touch (`08`).
- **Low light degrades both detection and landmarks.** The hand is found in 71% of frames, and the ratio never reads below 0.4 during a firm pinch (`07`).
- **Handedness labels aren't stable identities.** A single hand can switch between `Left` and `Right` when it's re-detected, and two hands can briefly share a label (`01`, `05`, `06`, `07`). The pipeline keys per-hand state by label, so a swap mid-stroke would end the stroke. Phase 2 should track hands by position instead.

## Recording new fixtures

Open the studio with `?record=fixtures`, start the camera, and use the panel: each scenario has a 3-second countdown and a fixed length, and it downloads with the right file name. For ad-hoc recordings, press **R** in the studio to start and stop. Replay a recording with `?fixture=<name>` to check it before committing.
