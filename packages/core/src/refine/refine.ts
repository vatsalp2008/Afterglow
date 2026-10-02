// Refine (ADR 0016): the drawing goes to the model as a square image of its strokes; the
// clean paths come back in that square's 1000x1000 viewBox and are placed over the
// drawing as strokes in the current brush, timed to draw themselves in one by one.

import type { StrokeStyle } from '../stroke/strokeBuilder.ts';
import type { Stroke, Vec2 } from '../types.ts';
import { svgPathToPolylines } from './svgPath.ts';

/** The model draws in a viewBox this many units square. */
export const REFINE_VIEWBOX = 1000;
/** At most this many paths come back. */
export const REFINE_MAX_PATHS = 40;

/** A square of the canvas (canvas units): what the model sees, and where its paths land. */
export interface RefineBox {
  x: number;
  y: number;
  size: number;
}

/**
 * A square around the strokes with a margin on every side, so the model sees the whole
 * drawing with room around it. Null without strokes.
 */
export function refineBox(strokes: readonly Stroke[], margin = 0.08, minSize = 200): RefineBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    for (const p of s.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (minX === Infinity) return null;
  const size = Math.max(minSize, Math.max(maxX - minX, maxY - minY) * (1 + 2 * margin));
  return { x: (minX + maxX) / 2 - size / 2, y: (minY + maxY) / 2 - size / 2, size };
}

export const toViewBox = (p: Vec2, box: RefineBox): Vec2 => ({
  x: ((p.x - box.x) / box.size) * REFINE_VIEWBOX,
  y: ((p.y - box.y) / box.size) * REFINE_VIEWBOX,
});

export const fromViewBox = (p: Vec2, box: RefineBox): Vec2 => ({
  x: box.x + (p.x / REFINE_VIEWBOX) * box.size,
  y: box.y + (p.y / REFINE_VIEWBOX) * box.size,
});

export interface DrawInTiming {
  /** Drawing speed, canvas units per ms. */
  unitsPerMs: number;
  /** Pause between strokes, ms. */
  gapMs: number;
  /** The whole draw-in takes at most this long; longer art draws faster. */
  maxMs: number;
}

export const DEFAULT_DRAW_IN: DrawInTiming = { unitsPerMs: 1.2, gapMs: 90, maxMs: 4000 };

/**
 * Strokes from the model's paths: one per subpath, in `style`, sampled every 2.5 canvas
 * units, at normal depth. Their points are timed from `startAt`, one stroke after another,
 * so a renderer that shows only what's due draws them in. Null if any path isn't valid.
 */
export function refinedStrokes(
  paths: readonly string[],
  box: RefineBox,
  style: StrokeStyle,
  startAt: number,
  createId: () => string,
  timing: DrawInTiming = DEFAULT_DRAW_IN,
): Stroke[] | null {
  const spacing = (2.5 * REFINE_VIEWBOX) / box.size;
  const lines: Vec2[][] = [];
  for (const d of paths.slice(0, REFINE_MAX_PATHS)) {
    const parsed = svgPathToPolylines(d, spacing);
    if (!parsed) return null;
    for (const line of parsed) if (line.length >= 2) lines.push(line.map((p) => fromViewBox(p, box)));
  }
  const lengths = lines.map((line) =>
    line.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - line[i]!.x, p.y - line[i]!.y), 0),
  );
  const natural = lengths.reduce((s, l) => s + l / timing.unitsPerMs, 0) + timing.gapMs * Math.max(0, lines.length - 1);
  const pace = natural > timing.maxMs ? timing.maxMs / natural : 1;
  let clock = startAt;
  return lines.map((line, k) => {
    const begin = clock;
    let along = 0;
    const points = line.map((p, i) => {
      if (i > 0) along += Math.hypot(p.x - line[i - 1]!.x, p.y - line[i - 1]!.y);
      return { x: p.x, y: p.y, depth: 1, t: begin + (along / timing.unitsPerMs) * pace };
    });
    clock = begin + (lengths[k]! / timing.unitsPerMs + timing.gapMs) * pace;
    return { id: createId(), brush: style.brush, color: style.color, size: style.size, createdAt: begin, points };
  });
}
