# 0006: Tool gestures: hand poses, one state machine, cooldowns

- Status: accepted
- Date: 2026-09-28

## Context

The brief asks for four tool gestures, debounced and with a cooldown:

- an open palm held 400 ms opens the radial menu;
- a fist pauses;
- a two-finger swipe left or right is undo or redo;
- a two-hand "frame" triggers Refine. This one must be verified as reliably detectable, or replaced.

Recordings `10`–`13` perform them, and the 11 recordings without gestures are the false-trigger test. The hard part isn't detecting the poses. It's not firing on the hand shapes people make anyway: hovering between strokes, relaxing after a gesture, or moving the hand back after a swipe.

## Decision

1. **Poses from finger geometry** (`handShape`, `classifyPose`). Each finger's extension is tip-to-wrist over knuckle-to-wrist, with extended at 1.55 or more and curled at 1.25 or less. Thumb spread and finger fan are measured in palm lengths.
   - **Open palm:** all four fingers extended, thumb spread at least 0.8, fan at least 1.15.
   - **Fist:** all four fingers curled, the index below 1.1 like the pen's fist gate ([ADR 0005](0005-pinch-detection.md)). The index is what tells a fist from a pinch made with the other fingers curled.
   - **Two fingers:** index and middle extended, ring and little curled.
   - **Frame corner:** index extended and pointing up (at least 55°), the other three curled, thumb spread at least 0.7. A **frame** is two corners with the thumb tips within 1 palm length of each other.
2. **One state machine for all gestures, driven by an explicit table** (`TOOL_TRANSITIONS`, drawn in [gesture-fsm.md](../gesture-fsm.md)). The states are ready, holding, active and cooling.
   - Each frame, the hands are reduced to at most one candidate gesture.
   - A held gesture fires once, when its hold completes: 400 ms for the open palm, 300 ms for the fist, 500 ms for the frame. It can't fire again until the pose ends.
   - Once a pose ends, nothing starts for 800 ms (**cooling**).
3. **"Held" means still.** An open palm must stay within 0.3 palm lengths of where the hold began, with its thumb-to-index distance within 0.2 palm lengths. A hand opening on its way into a pinch doesn't qualify.
4. **Swipes** fire while two fingers are up. A swipe is 1.5 palm lengths of horizontal travel, within 500 ms of starting to move, at least twice as far across as down. Left in the mirrored view is undo, right is redo. **A move the opposite way that starts within 1 s of a swipe ending counts as the hand returning, and is ignored.** You chose this rule over requiring a relaxed hand to return. The cost is that undo then redo needs a 1 s pause between them.
5. **Guards:**
   - nothing fires while any hand is drawing, and a hold in progress is dropped;
   - a hand with more than 2 landmarks outside the frame makes no gesture;
   - a frame where the pose is misread can extend a hold (up to 100 ms), but can't complete it.
6. **The frame gesture is kept for Refine.** It is reliable on the recording, as the evidence below shows, so no replacement is needed.
7. **Pause toggles.** A fist pauses drawing with the hands, and the next fist (or P) resumes it. The pointer still draws while paused. The menu and Refine gestures are counted in the stats panel until the radial menu (Phase 4) and Refine (Phase 5) exist.

## Evidence

From `pnpm --filter @afterglow/fixtures eval`. Gesture windows are labeled in [`fixtures/labels.json`](../../fixtures/labels.json).

| Recording                  | Labeled      | Detected | False triggers |
| -------------------------- | ------------ | -------- | -------------- |
| `11-fist`                  | 4 pauses     | 4        | 0              |
| `13-frame`                 | 3 refines    | 3        | 0              |
| `10-open-palm`             | 3 menu opens | 1        | 1              |
| `12-swipes`                | not labeled  | 3 redos  | –              |
| 11 recordings, no gestures | none         | none     | **0**          |

- **The poses separate cleanly.**
  - On the recordings without gestures, thumb spread is at most 0.88 at the 90th percentile, against a median of 1.04 for the held palm in `10`.
  - Fists in `11` read 0.5–1.0 extension per finger, and the partly visible hand in `05` reads 1.2–1.38.
  - In `13` the frame corners read 1.8 index extension with the other fingers at 0.6–0.9.
- **Two rules came from false triggers found while developing.**
  - **06, a drawing hand, opened the menu.** Between strokes it was spread enough for about 400 ms while closing into the next pinch. Its thumb-to-index distance fell from 1.22 to 0.41 palm lengths during the hold. That's why a held palm must also keep its shape still, and why a misread frame can't complete a hold.
  - **05's partly visible hand paused** once the curl threshold was loosened to 1.35. That's the reason for the out-of-frame guard.
- **Sensitivity:** each of 13 thresholds was nudged by 5–50% (for example, curl 1.25 to 1.15 and 1.35, hold 400 to 300 ms, cooldown 800 to 500 ms). Through all of it the recordings without gestures stayed at zero, and `11` and `13` stayed exact.
- **The cooldown is what keeps `11` exact.** After each fist, the hand relaxes by opening wide, into an open palm, for 0.5–0.8 s. Without the cooldown, those moments would open the menu.

## Known gaps

- **`10` can't show re-arming.** The palm stays open and spread between raises, and a held pose fires once until it ends, so raises 2 and 3 don't fire. The thumb relaxes on the third raise, which ends the pose. It re-forms while lowered and fires at 12 s, which counts as a false trigger. This is tracked as an expected failure in the golden tests. The new scenario `16-open-palm-2` drops the hand out of view between holds, so it can test re-arming.
- **`12`'s swipes can't be scored.** The hand moves left, right, left, right, left, right, left at the same speed each way. It isn't known which moves were swipes, and the first move starts before the recording does. Under the return rule, the 3 rightward moves fire as redo and the leftward ones count as returns. That may be the opposite of what was meant. The new scenario `17-swipes-2` has an exact expected result: 3 undos, then 3 redos.
- All the thresholds come from one person's hands.

## Alternatives considered

- **Open hand held still, with no spread requirement.** That is the brief's wording taken literally, but it's also how people hover between strokes. `01` holds one for 10 s.
- **Separate state machines per gesture.** Only one gesture can sensibly be active at a time, and the cooldown has to span gestures (fist, then relaxing into an open palm). So one machine with a candidate is simpler.
- **Telling swipes from returns by speed.** In `12` both directions peak at 0.7–1.3 frame widths per second, so there is nothing to separate them.
- **World landmarks.** They didn't separate rotated pinches ([ADR 0005](0005-pinch-detection.md)), and image-space geometry already separates these poses.
