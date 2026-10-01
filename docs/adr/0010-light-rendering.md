# 0010: Light rendering: measure first, keep one mesh per stroke

- Status: accepted
- Date: 2026-10-01

## Context

The prototype already had the layered renderer, light-only bloom, the darkroom shader, the neon and ink brushes, and fade. Phase 3's gate is 60 FPS with 500 strokes on the reference machine, plus a measured capture-to-ink latency.

The brief and the plan suggested three things:

- perfect-freehand outlines for neon;
- merged geometry for 500 strokes;
- GPU particles for sparks.

An earlier stress run had already drawn 500 strokes at 60 fps with none of these. So the renderer was measured before any optimization was chosen.

## Decision

1. **Measure correctly first.**
   - **Capture-to-ink latency** is recorded only for tracker frames that change ink. It runs to the next animation frame after the render that drew the ink, a stand-in for when it reached the screen. It used to be recorded on every frame, and only up to the render call.
   - **Frame cost** covers the whole tick: stroke sync, render, and cursors.
   - **Draw calls and triangles** count the whole frame. The composers render several passes, and `renderer.info` used to reset after each one.
   - The stats panel shows all three, plus the geometries held on the GPU.
2. **A render benchmark** (`?bench=render`, `pnpm --filter @afterglow/web bench:render`) measures, at pixel ratio 2:
   - frame cost and draw calls with 0 to 1000 realistic synthetic strokes (`?stress=N`), including a GPU-synced block (render, then read back one pixel) that shows real headroom beyond the 60 Hz cap;
   - an eraser gesture across 500 strokes;
   - live strokes up to 2000 points;
   - the spark system;
   - ink latency while a recording draws.
3. **No batching.** Each committed stroke stays one mesh. At 1000 strokes the CPU cost is 1.8 ms p95 for 1016 draw calls. CPU plus GPU is 12.4 ms p95, inside the 16.7 ms budget. Most of the GPU time is the fixed bloom and composite at full Retina resolution, 8.7 ms on an empty canvas, which batching wouldn't touch.
   - If batching is needed later, Three's `BatchedMesh` isn't a good fit. It reuses the lowest freed slot, which reorders draws (and ink is blended in draw order), and it only reclaims deleted geometry on `optimize()`. Chunked merging with a per-chunk range table would be the approach.
4. **Sparks stay on the CPU, with drift added.** Updating and uploading all 4000 particles takes 0.1 ms a frame, which is at the timer's resolution. GPU particles would save nothing measurable.
5. **Fade culling.** With fade on, a stroke ten time constants old is skipped: below what 8-bit color can show. This is decided at render time, so a long-exposure save, which renders with fade off, still includes every stroke.
6. **Neon keeps its glowing strip; perfect-freehand isn't used.** The owner chose this. The strip's across-coordinate gives the hot white core fading to colored edges, the look approved in the prototype. A filled outline would lose that gradient and lean on bloom alone. No dependency is added.
7. **One brush table** (`packages/render/src/brushes.ts`) gives each brush its layer, material, and geometry builder.
   - The sparks core's extra brightness moved into a vertex attribute, so it shares neon's material.
   - The new ribbon brush is in [ADR 0011](0011-relative-depth-and-nib.md).

## Evidence

Apple M3 Pro, headless Chrome on Metal, 1440x900 at pixel ratio 2 (`docs/benchmarks/data/render-*.json`):

| Strokes | Draw calls | CPU p95 | CPU + GPU p95 | Slow frames |
| ------- | ---------- | ------- | ------------- | ----------- |
| 0       | 16         | 1.0 ms  | 8.7 ms        | 0%          |
| 500     | 516        | 2.9 ms  | 12.1 ms       | 0%          |
| 1000    | 1016       | 1.8 ms  | 12.4 ms       | 0%          |

- Live stroke rebuild: 0.5 ms at 2000 points. It happens once per input frame, so incremental rebuilding isn't needed.
- Erasing across 500 strokes: 0.4 ms per step at the median.
- Pipeline to ink on screen, during the recorded session: 28 ms at the median, 31 ms at p95. That's about 1.5 display frames: input arrives partway through a frame, the next frame draws it, and the one after shows it.

## Consequences

- **The gate is met on the reference machine with room to spare.** Weaker integrated GPUs will mostly feel the fixed full-resolution bloom and composite. The remedy then is lowering the pixel ratio when frames run slow, not batching. The benchmark measures that cost directly, so the decision can be made with numbers.
- The benchmark runs headless, so its frame interval is capped at 60 Hz. The GPU-synced column is what shows headroom.
