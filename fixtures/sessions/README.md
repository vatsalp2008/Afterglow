# Recorded hand sessions

Each file is one recorded session: the raw (unfiltered) hand landmarks MediaPipe produced for every camera frame, with capture timestamps. **Only the 21 landmark points per hand are stored, never images or video.**

Fixtures make the input pipeline testable without a camera. They drive the filter and gesture tests, the Filter Lab, the benchmarks, and end-to-end tests. Replay one in the studio with `?fixture=<name>`, for example `?fixture=04-pinch-on-off`.

## Format

`SessionRecording` from `packages/core/src/session.ts`, validated by `parseSessionRecording`:

- `version`: always `1`.
- `meta`: browser user agent, video size, measured tracking rate, tracker (`worker` or `main`) and delegate, recording time, and the scenario id and instructions.
- `frames`: `{ frameId, captureTime, hands }`, where `captureTime` is in milliseconds from the first frame. Each hand has a `key`, a `handedness` (already corrected for the mirrored view), a `score`, and 21 `landmarks` in MediaPipe's normalized image coordinates (unmirrored), rounded to 5 decimals.

## Scenarios

| File                        | What was performed                                                | Expected pipeline behavior                                  |
| --------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| `01-still-hand.json`        | One open hand held still, palm to the camera, no pinch            | No strokes; basis for stationary jitter measurement         |
| `02-slow-circles.json`      | Pinch, 3 slow circles without letting go, release                 | Exactly 1 stroke                                            |
| `03-fast-zigzag.json`       | Pinch, 5 fast left-right zigzags, release                         | Exactly 1 stroke; basis for lag measurement at speed        |
| `04-pinch-on-off.json`      | Pinch and release 5 times, about a second apart                   | Exactly 5 strokes                                           |
| `05-hand-leaves-frame.json` | Draw, leave the frame while pinched, return, draw again           | A stroke ends with `handLost`, then a new stroke starts     |
| `06-two-hands.json`         | Draw with the left hand, then the right, then both at once        | Strokes from two hand keys, some overlapping in time        |
| `07-low-light.json`         | One slow line in a dim room                                       | 1 stroke despite lower detection confidence                 |
| `08-rotated-hand.json`      | Draw while rotating the wrist so the palm turns sideways and down | 1 stroke; the pinch ratio stays usable through the rotation |

## Recording new fixtures

Open the studio with `?record=fixtures`, start the camera, and use the panel: each scenario has a 3-second countdown and a fixed length, and it downloads with the right file name. For ad-hoc recordings, press **R** in the studio to start and stop.
