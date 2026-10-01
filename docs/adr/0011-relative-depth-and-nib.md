# 0011: Relative depth, and the ribbon as a broad nib

- Status: accepted
- Date: 2026-10-01

## Context

Moving a hand closer to the camera makes strokes thicker and brighter. Depth used to be absolute: apparent palm size against a fixed 0.18 frame heights. So the same gesture drew thin lines for someone sitting back and thick ones for someone close. The brief asked for smoothed, relative depth with a calibration step, but the owner wants no calibration ([ADR 0007](0007-no-calibration.md)).

The brief's ribbon brush "twists with hand roll". The owner chose a broad pen nib that follows the knuckle line. It's wide moving across the nib, thin moving along it, and it twists as the hand turns.

## Decision

1. **Depth is relative to the hand's usual size,** learned while it isn't drawing (`PenShape`, `packages/core/src/gesture/penShape.ts`, one per hand inside `PinchTracker`).
   - The usual size follows the hand with a 4 s time constant. It starts as a running mean of the first frames, so a stroke started right after the hand appears begins at normal width.
   - It holds still while drawing, so leaning in mid-stroke thickens the line.
   - Hands with any landmark outside the frame aren't learned from, since part of them is guessed.
   - `depth = clamp((size / usual)^0.8, 0.5, 2)`. Wherever someone sits gives normal width.
2. **Hand size is the larger of palm length and 1.56 × knuckle width.**
   - Palm length is 1.56 knuckle widths at the median across the fixtures.
   - Palm length shrinks when the hand tips forward, and knuckle width when it turns sideways, as it does to steer the nib. Their larger stays steady, so turning the hand doesn't read as moving away.
3. **No extra depth smoothing.** On the still hand, size changes by 0.03% a frame at the median (0.12% at p95) after the One Euro filter, so another filter would only add lag.
4. **The nib angle** comes from the knuckle line (landmarks 5 to 17), converted to canvas space (mirrored, aspect-correct) by `landmarkAngleOnCanvas` in `coords.ts`.
   - When the hand is edge-on (knuckle width under 0.3 palm lengths), the last angle is held.
   - Angles are axial: θ and θ+π are the same nib. `densify`, the stroke builder, and the eraser carry the angle and interpolate it the short way round.
   - Without a hand (mouse, pen), the nib is a fixed italic slant of −45°.
5. **The ribbon is drawn as the nib looks from the side of the path** (`packages/render/src/nib.ts`).
   - The strip stays perpendicular to the path, as wide as the nib's projection: full when the nib is square to the path, a minimum of 18% when it runs along it.
   - Where the hand turns the nib through the path, the ribbon narrows to its edge and widens again, which reads as a twist.
   - The broad side is drawn brighter than the edge, and rims are bright like lit satin.
   - The path is lightly smoothed (about ±5 units), and its direction is measured over about ±10 units. On fixture 02, a slow hand moves about 2.6 units a frame while its pen point wanders 0.5 units off its path at the median and 2.4 at p95. The ribbon's crisp rims would otherwise show that as beading.

## Alternatives considered

- **Offsetting each point along the nib itself,** the literal broad-nib construction. It draws the same outline in theory. In practice it makes long overlapping slivers wherever the nib runs near the path, and their bright rims aliased into a sawtooth on hand-drawn strokes. Seen in screenshots of fixture 02.
- **Rolling the wrist** (the palm's normal) to drive the twist. Wrist roll is what MediaPipe tracks least reliably, as the rotated-hand fixtures showed ([ADR 0005](0005-pinch-detection.md)).
- **A calibration step for depth,** ruled out by the owner.

## Consequences

- No one has to set anything up for depth to work. The trade-off is that a person who leans in and stays there for several seconds slowly returns to normal width. That is intended: the reference is where they usually are.
- The ribbon inherits the hand path's real wobble, more visibly than neon does, because its edges are crisp.
