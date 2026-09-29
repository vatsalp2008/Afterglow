# 0007: One set of pinch thresholds for everyone, no calibration

- Status: accepted; supersedes the calibration decision in [ADR 0005](0005-pinch-detection.md)
- Date: 2026-09-29

## Context

[ADR 0005](0005-pinch-detection.md) paired thresholds tuned on the recordings with an optional per-person calibration. In practice that failed in three ways:

- **Other people never drew.** They pinched on the recording author's browser, using the author's saved calibration.
- **Even the author needed to calibrate** before the pinch worked live.
- **A calibration is saved per browser**, but it describes one person's hand.

The fist gate was the main cause of the first failure. It's fixed in ADR 0005's second revision. But the product requirement is now explicit: **a simple pinch from anyone, with no calibration step.** The thresholds therefore have to suit hands they weren't tuned on.

## Decision

1. **Calibration is removed.** That covers the guided panel, the first-run offer, the saved settings, and `calibratePinch`. The stats panel keeps its pinch sliders as a developer tool. They aren't saved.
2. **The thresholds sit in the middle of the gap between pinched and open hands, rather than being fitted to one person's pinch.**
   - Across the recordings, the pinch measure reads 0.16 at the median of pinched frames and 0.33 at their 95th percentile. Open and relaxed hands read 0.46 or more in 95% of frames, and 1.04 at the median.
   - The old start threshold, 0.24, sat inside the author's own pinch range. Anyone whose pinch reads a little looser never got below it.
3. **Start below 0.30, held for 3 frames; release above 0.40 for 100 ms.**
   - 0.30 is the loosest start that keeps every recording clean. Beyond it, the brief pinch-like moment while a hand closes into a fist draws for about 0.2 s. A relaxed or open hand never draws, even at a start of 0.40.
   - Requiring 3 frames instead of 2 is what makes 0.30 clean: with 2 frames, the fist-closing moment already draws at 0.30.
   - The release can't go above 0.40: at 0.42 or more, two of `04`'s separate pinches merge.

## Evidence

From `pnpm --filter @afterglow/fixtures eval` and the threshold scans behind this ADR.

|                                                       | Before (0.24 / 0.38, 2 frames) | Now (0.30 / 0.40, 3 frames) |
| ----------------------------------------------------- | ------------------------------ | --------------------------- |
| Stroke-count errors                                   | 6                              | 4                           |
| Mean pen-state F1                                     | 0.828                          | 0.835                       |
| Broken strokes per minute, clean fixtures (02–04, 14) | 1.9                            | 0.0                         |
| Broken strokes per minute, all held pinches           | 3.9                            | 1.9                         |
| `14-low-light-2`                                      | 2 strokes, 88% of the pinch    | 1 stroke, 95%               |
| Pen-down time on the recordings without a pinch       | 0 s                            | 0 s                         |

## Alternatives considered

- **Keep calibration as an option.** It isn't wanted, and a saved calibration leaks to whoever uses the browser next.
- **Adapt the thresholds to each hand automatically, from how it moves.** This isn't possible yet. The relaxed-hand floor (about 0.43) caps how far a start threshold could adapt. And without recordings of other people there's nothing to validate an adaptive rule against.
- **A stricter fist rule (index below 1.2) to allow a start at 0.36.** It would block more of the pinches of people who curl their other fingers, the failure the second revision of ADR 0005 fixed.

## Consequences

- A pinch reading up to 0.30 now starts a stroke. That's 1.9 times the author's median pinch.
- Starting takes one frame longer (about 33 ms at 30 fps).
- The thresholds are still derived from one person's recordings. Someone whose pinch never reads below 0.30, or whose released hand stays below 0.40, would still have trouble. The guest recorder (`?record=guest`) exists to check this on other people's hands, and its recordings should be scored before the thresholds change again.
