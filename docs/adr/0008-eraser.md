# 0008: The eraser removes what it touches

- Status: accepted
- Date: 2026-09-29

## Context

Strokes used to fade like a long exposure by default, which also served as the only way to get rid of them apart from undo and clear. Strokes now stay unless fading is switched on (F), so the studio needs an eraser that works with a pinch as well as a mouse.

## Decision

1. **Erasing removes only what the eraser passes over.** Erasing through the middle of a stroke splits it into two strokes (`eraseStrokes` in `packages/core/src/stroke/eraser.ts`).
   - A point of a stroke is erased when the eraser reaches its drawn edge: within the eraser's radius plus half the stroke's width at that point.
   - Strokes are smoothed the way the renderer draws them before cutting, so cuts land on the line people see. They're then subdivided finer than the eraser, so a long segment between two samples can't pass through it untouched.
2. **The eraser is a tool, like a brush.** Pick it in the dock or press E. After that, a pinch or a mouse drag erases instead of drawing. The tool is fixed for a whole stroke, and picking a brush or a color switches back to drawing.
   - Its radius follows the size setting (12, 22 or 38 canvas units), larger than the brush so imprecise hand movement still hits the line.
   - The cursor becomes a ring of that size.
3. **One erase gesture is one undo step.** Erasing swaps strokes for their remaining pieces with `History.replace`. Swaps from the same gesture merge into a single command, so pieces made and erased again mid-gesture never reach the undo history.

## Alternatives considered

- **Removing whole strokes** on touch, as vector editors often do. It's simpler, but with hands a long stroke would vanish because its corner was brushed.
- **Masking pixels instead of editing strokes.** Strokes are the document: timelapse replay, export, snapping (Phase 5), and rooms (Phase 6) all work from stroke points. So erasing has to change the strokes.

## Consequences

- Pieces keep their original point times, so the timelapse replays what's left of a stroke at the moment it was drawn.
- Undo puts erased strokes back at the end of the stroke list rather than in their old position. Order isn't visible for additive light strokes. For overlapping ink strokes, only the order they're blended in can change.
- In rooms (Phase 6), an erase will be a replace of strokes in the shared document, so undoing it only restores that user's own erase.
