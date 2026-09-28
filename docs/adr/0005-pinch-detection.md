# 0005: Pinch detection: fingertip-pad measure, fist gate, tuned hysteresis, rejoin window

- Status: accepted, revised after recordings 09–15 (see [Revision](#revision-recordings-0915))
- Date: 2026-09-28

## Context

Phase 1's pinch detector compared the thumb-to-index fingertip distance, relative to palm length, against fixed thresholds (0.25 to start, 0.35 to release, 2 frames each). The first 8 recorded fixtures showed three failures:

- **Fast motion broke strokes:** `03` drew as 7 strokes. Quick moves spiked the measure past the release threshold for two frames.
- **Low light never drew:** `07` produced 0 strokes. During a firm pinch, the fingertip landmarks read 0.4 to 0.8 apart.
- **Rotation broke strokes:** `08` drew as 4 strokes covering 38% of the pinch.

Counting strokes turned out to be misleading, so fixtures were labeled with pinched time intervals, and the evaluation harness (`packages/core/src/eval`) scores time-weighted precision and recall.

## Decision

1. **Pinch measure: `min(tipRatio, 1.2 × padRatio)`.** The pad ratio is the thumb tip's distance to the index finger's last segment (landmarks 7 to 8), relative to palm length. A thumb pressed on the fingertip pad reads as pinched even when the two tip landmarks sit apart.
2. **A fist gate.** A hand whose middle, ring, and little fingers are all curled is a fist, and never counts as a pinch. Curl is `fingerExtension`: the largest tip-to-wrist over knuckle-to-wrist ratio of those three fingers, and the gate is below 1.4. In a fist the thumb genuinely presses on the index finger, so no distance measure can tell a fist from a pinch.
3. **Hysteresis:** start below 0.24 (2 frames); release above 0.38 for 100 ms (and at least 2 frames). The release is timed rather than counted because the recordings run at 19 to 30 fps.
4. **A 250 ms rejoin window:** after a release the pen lifts immediately, but closing again within 250 ms continues the same stroke. This recovers coverage that strict thresholds lose, without breaking strokes.
5. **An explicit transition table** (`PEN_TRANSITIONS`) that the state machine executes directly. `docs/gesture-fsm.md` is generated from it, and CI fails if the doc is stale.
6. **Per-user calibration** (`calibratePinch`): 2 s of open hand and 2 s of pinch set the thresholds. It refuses when open and pinched can't be told apart, rather than guessing. It also measures finger extension during the pinch. For someone who pinches with the other fingers curled, as if holding a pen, it turns the fist gate off, since that pinch would otherwise read as a fist. Calibrating from `04`'s own data reproduces its 7 strokes.
7. **One Euro (0.3, 16) smoothing**: 0.24 px jitter on a still hand against 0.44 px raw, for 20 ms of lag.

## Evidence

From [benchmarks.md](../benchmarks.md#input-pipeline-on-the-recorded-fixtures-phase-2), over all 15 recordings:

|                                                         | Phase 1     | Current     |
| ------------------------------------------------------- | ----------- | ----------- |
| Mean pen-state F1 (13 labeled fixtures)                 | 0.727       | **0.828**   |
| Broken strokes per minute of pinching, all held pinches | 10.6        | **3.9**     |
| Pen-down time on the 6 fixtures that never pinch        | 3.7 s       | **0 s**     |
| `03` strokes, recall                                    | 7, 0.79     | 1, 0.97     |
| `11-fist` strokes                                       | 5           | 0           |
| `14-low-light-2` strokes, recall                        | 3, 0.57     | 2, 0.88     |
| `08` / `15` (rotation) recall                           | 0.38 / 0.25 | 0.42 / 0.25 |

## Revision: recordings 09–15

The first version of this decision (milestone A) measured the thumb against the index finger's last _two_ segments, released after 3 frames, and was tuned on recordings 01–08 alone. Recordings 09–15 added hands that should never draw, and second takes of low light and rotation that include MediaPipe's world landmarks. They changed three things.

- **The two-segment measure drew on a relaxed hand.** A loosely curled hand rests its thumb against the middle segment of the index finger. On `09-relaxed-hand` the pen was down for 7.7 s. The median thumb-to-two-segments ratio there is 0.32, against 0.38 for `07`'s firm pinch: the two can't be separated. Measured to the last segment (the pad) only, `09` reads 0.50 and draws nothing. The cost is `07`, which went from 32% coverage in 4 strokes to 0%: its side-of-finger pinch looks like `09`'s relaxed hand. The second low-light take, `14`, pinches on the pad and draws 88% of the pinch.
- **A fist reads as a pinch on every measure.** On `11-fist` milestone A drew 4 strokes, 9.2 s in total, and Phase 1 drew 5. All 1,476 labeled pinched frames have a finger extension of at least 1.71. The fist frames whose pinch measure is below the start threshold read 0.83 at the median and 1.26 at most. The gate at 1.4 separates them with margin on both sides.
- **With the pad measure, 3 release frames broke `03` again**, because the measure spikes longer during fast moves. Releasing after 100 ms fixes it (1 stroke, 97%). A 4-frame release does too, but four frames span 100 ms at 30 fps and 150 ms at 20 fps. The pen-up delay on `04` goes from 234 ms to 267 ms median.

### World landmarks: not adopted

MediaPipe's world landmarks are metric 3D coordinates in centimeters, centered on the hand. They were expected to fix rotation, where the fingertips separate in the image while the fingers touch. They don't: MediaPipe mispredicts the occluded fingertips in 3D too.

| Hand                      | Fingertip distance (median) | Thumb to pad (median) |
| ------------------------- | --------------------------- | --------------------- |
| `15` rotated, pinched     | 5.7 cm                      | 3.5 cm                |
| `09` relaxed, not pinched | 5.4 cm                      | 3.6 cm                |
| `14` low light, pinched   | 2.4 cm                      | 1.5 cm                |

In world space a rotated pinch is indistinguishable from a relaxed hand. So the experiment's decision rule (adopt only if held-pinch coverage improves without hurting other fixtures) rejects it. The recorder keeps capturing world landmarks, since later experiments may use them.

## Alternatives considered

- **The strictest thresholds that minimize stroke-count errors** (start 0.16–0.19). On the clean fixtures they have no broken strokes. But on `14` they get the count right only because the pen never comes back after the pinch loosens, missing its last 1.2 s; on `08` they draw 11% of the pinch. A count that's right because a stroke was cut short isn't right, and the tuner now counts it as an error.
- **A longer rejoin window to bridge `14`'s loosened pinch.** In `14` the fingers part for about 650 ms before closing again. The gaps between `04`'s separate pinches are 600–835 ms, so a window long enough for `14` would merge `04`'s strokes.
- **A higher release threshold (0.45)** also bridges `14`, but merges two of `04`'s pinches.
- **Kalman smoothing.** It is dominated by One Euro on both jitter and lag, and overshoots sudden stops (see benchmarks).
- **Tip-to-tip only, with calibration.** Calibration can't fix low light when the tips genuinely read apart during a pinch.

## Consequences

- The clean fixtures are exact. Fast motion is fixed, and none of the six recordings without a pinch draws anything, including a fist and a relaxed hand.
- **Known gaps**, tracked as expected failures in the golden tests:
  - rotation (`08`: 42% coverage in 4 strokes; `15`: 25%);
  - the first low-light take (`07`: nothing drawn);
  - one break in `14`, where the pinch loosens for about 650 ms.

  Rotation is the largest remaining gap, and neither image-space nor world-space fingertip distances can fix it. A learned pinch classifier (Phase 3's ML work) is the next thing to try.

- The fist gate means anyone who pinches with the other fingers curled can't draw until they calibrate. Calibration detects this and turns the gate off. All of the recordings come from one person, whose pinches keep those fingers extended.
- Pen-up latency after a release is about 267 ms at the median on `04`. Part of that is definitional: the label marks the release at a fingertip ratio of 0.3, but the release threshold is 0.38.
- The thresholds were tuned on one person's hand and camera. Calibration, which is offered on first camera use, is how they generalize. More recordings from other people would make the defaults more trustworthy.
