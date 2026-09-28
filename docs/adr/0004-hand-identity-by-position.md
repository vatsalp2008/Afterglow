# 0004: Track hands by position, not by handedness label

- Status: accepted
- Date: 2026-09-28

## Context

Per-hand state (the smoothing filters and the pinch state machine) needs a key that stays the same for as long as one physical hand is in view. Phase 1 keyed it by MediaPipe's handedness label.

The recorded fixtures show that the label isn't an identity:

- A single hand switches between `Left` and `Right` when MediaPipe re-detects it (`01`, `05`, `07`).
- Two hands can briefly share a label, which the adapter had to disambiguate as `Right#1` (`06`).
- The same hand can be detected twice in one frame (`01`).

Any of these, mid-stroke, would end the stroke and start a new one.

## Decision

A `HandIdentity` stage runs before filtering, and assigns each detection a stable id (`hand-1`, `hand-2`, ...) by palm position:

- **Matching:** each detection's palm center (the mean of the wrist and the four knuckles) is matched greedily, nearest first, to known hands.
- **Reach:** a detection matches if it is within `maxJump` × (1 + frames missing) of a known hand.
- **Duplicates:** detections within `duplicateRadius` of each other are merged, keeping the higher score.
- **Gaps:** a hand keeps its id for `graceFrames` missing frames, which is at least the pinch loss grace. A hand that briefly drops out is therefore still the same hand.
- **Handedness** becomes metadata, smoothed by a decaying vote weighted by score.

The defaults come from the fixtures:

| Setting           | Value                        | Evidence                                                                                |
| ----------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| `maxJump`         | 0.25 frame heights per frame | Per-frame palm movement stays under 0.07, and under 0.17 with low-light detection jumps |
| `duplicateRadius` | 0.10                         | Two real hands were never closer than 0.30; the duplicate in `01` was 0.03 apart        |
| `graceFrames`     | 15 (about 0.5 s)             | Longer than the pinch loss grace of 4 frames                                            |

## Results on the fixtures

| Fixture                | MediaPipe labels seen | Stable ids               |
| ---------------------- | --------------------- | ------------------------ |
| `01-still-hand`        | Left, Right, Right#1  | 1 (one duplicate merged) |
| `05-hand-leaves-frame` | Left, Right           | 1                        |
| `06-two-hands`         | Right, Left, Right#1  | 2                        |
| `07-low-light`         | Right, Left           | 1                        |
| Others                 | 1 label               | 1                        |

## Alternatives considered

- **Keep keying by label and debounce label changes.** A swap can still land mid-stroke, and duplicate labels on two hands would need special handling.
- **Optimal assignment (Hungarian algorithm).** With at most two or three hands, nearest-first greedy matching gives the same answer.
- **Match on all 21 landmarks, not just the palm center.** That adds cost with no measured benefit. Palm centers of two hands are far apart.

## Consequences

- Filter and pinch state survive label flips and duplicate detections.
- If two hands cross each other closely, their ids can swap. The fixtures don't include that case; record one if it matters in practice.
- Handedness is still reported, smoothed, for any feature that needs to tell hands apart. In low light it remains unreliable (12 changes in `07`), so nothing should depend on it for correctness.
