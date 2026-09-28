# 0005: Pinch detection: segment measure, tuned hysteresis, rejoin window

- Status: accepted (the world-landmark experiment may amend it)
- Date: 2026-09-28

## Context

Phase 1's pinch detector compared the thumb-to-index fingertip distance, relative to palm length, against fixed thresholds (0.25 to start, 0.35 to release, 2 frames each). The recorded fixtures showed three failures:

- **Fast motion broke strokes:** `03` drew as 7 strokes. Quick moves spiked the measure past the release threshold for two frames.
- **Low light never drew:** `07` produced 0 strokes. During a firm pinch, the fingertip landmarks read 0.4 to 0.8 apart.
- **Rotation broke strokes:** `08` drew as 4 strokes covering 38% of the pinch.

Counting strokes turned out to be misleading, so fixtures were labeled with pinched time intervals, and the evaluation harness (`packages/core/src/eval`) scores time-weighted precision and recall.

## Decision

1. **Pinch measure: `min(tipRatio, 1.2 × segmentRatio)`.** The segment ratio is the thumb tip's distance to the index finger's last two segments. A thumb pressed against the side of the finger reads as pinched even when the tips are apart. That's what happens in low light: `07`'s segment distance reads 0.0–0.2 while the tips read 0.4–0.8.
2. **Hysteresis:** start below 0.24 (2 frames) and release above 0.38 (3 frames). These are the middle of the region where the clean fixtures have zero stroke errors: start 0.18–0.28, release 0.35–0.40.
3. **A 250 ms rejoin window:** after a release the pen lifts immediately, but closing again within 250 ms continues the same stroke. This recovers coverage that strict thresholds lose, without breaking strokes.
4. **An explicit transition table** (`PEN_TRANSITIONS`) that the state machine executes directly. `docs/gesture-fsm.md` is generated from it, and CI fails if the doc is stale.
5. **Per-user calibration** (`calibratePinch`): 2 s of open hand and 2 s of pinch set the thresholds. It refuses when open and pinched can't be told apart, rather than guessing. Calibrating from `04`'s own data reproduces its 7 strokes.
6. **One Euro (0.3, 16) smoothing**: 0.24 px jitter on a still hand against 0.44 px raw, for 20 ms of lag.

## Evidence

From [benchmarks.md](../benchmarks.md#input-pipeline-on-the-recorded-fixtures-phase-2):

|                                                       | Phase 1 | Phase 2 |
| ----------------------------------------------------- | ------- | ------- |
| Mean pen-state F1                                     | 0.721   | 0.826   |
| Broken strokes per minute of pinching, clean fixtures | 14.7    | 0.0     |
| `03` strokes, recall                                  | 7, 0.79 | 1, 0.98 |
| `07` strokes, recall                                  | 0, 0.00 | 4, 0.32 |
| `08` strokes, recall                                  | 4, 0.38 | 4, 0.45 |

## Alternatives considered

- **The strictest thresholds that minimize stroke-count errors** (start 0.16). They produce the fewest broken strokes but only about 10% coverage on `07` and `08`. For a user, a rotated stroke drawn at 49% in pieces beats one drawn at 10% in one piece.
- **A time-based release (66–150 ms) instead of a frame count.** It was within noise of 3 frames at 22–30 fps. The parameter (`exitMs`) remains available for high-frame-rate cameras.
- **Kalman smoothing.** It is dominated by One Euro on both jitter and lag, and overshoots sudden stops (see benchmarks).
- **Tip-to-tip only, with calibration.** Calibration can't fix low light when the tips genuinely read apart during a pinch.

## Consequences

- The clean fixtures are exact, and fast motion is fixed.
- **Known gaps**, tracked as expected failures in the golden tests:
  - low light (`07`: 32% coverage, 4 strokes);
  - rotation (`08`: 45%, 4 strokes);
  - leaving the frame (`05`: 4 strokes against 2).

  World landmarks (metric 3D) are the next experiment for rotation.

- Pen-up latency after a release averages about 230 ms on `04`. Part of that is definitional: the label marks the release at a fingertip ratio of 0.3, but the release threshold is 0.38. Lowering the release threshold trades against stroke breaks.
- The thresholds were tuned on one person's hand and camera. Calibration, which is offered on first camera use, is how they generalize. More recordings from other people would make the defaults more trustworthy.
