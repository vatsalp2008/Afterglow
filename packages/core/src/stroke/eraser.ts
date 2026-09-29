// The eraser removes the parts of strokes it passes over, like a real eraser: erasing
// through the middle of a stroke splits it in two. The pieces get new ids from
// `createId`; the caller swaps them in (History.replace) so erasing can be undone.

import type { Stroke, StrokePoint, Vec2 } from '../types.ts';
import { densify } from './catmullRom.ts';

export interface EraseResult {
  /** Strokes the eraser touched, as they were. */
  removed: Stroke[];
  /** What's left of them, as new strokes. */
  added: Stroke[];
}

// Strokes are smoothed the way the renderer draws them (ribbon spacing), so cuts land
// on the line people see, then subdivided finer than the eraser so no segment can pass
// through it untouched.
const SMOOTHING = 2.5;

// Half the drawn width at a point, as the renderer computes it (without per-brush scaling,
// so the eraser reaches thin spark cores a little early rather than late).
const halfWidth = (s: Stroke, p: StrokePoint) => s.size * 0.5 * Math.min(2.2, Math.max(0.4, p.depth));

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// Committed strokes never change, so their bounds are computed once.
const bounds = new WeakMap<Stroke, Box>();

function strokeBox(s: Stroke): Box {
  let box = bounds.get(s);
  if (!box) {
    box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const p of s.points) {
      box.minX = Math.min(box.minX, p.x);
      box.minY = Math.min(box.minY, p.y);
      box.maxX = Math.max(box.maxX, p.x);
      box.maxY = Math.max(box.maxY, p.y);
    }
    bounds.set(s, box);
  }
  return box;
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

function subdivide(points: readonly StrokePoint[], maxGap: number): StrokePoint[] {
  const out: StrokePoint[] = [];
  points.forEach((p, i) => {
    const prev = points[i - 1];
    if (prev) {
      const steps = Math.ceil(Math.hypot(p.x - prev.x, p.y - prev.y) / maxGap);
      for (let k = 1; k < steps; k++) {
        const u = k / steps;
        out.push({
          x: prev.x + (p.x - prev.x) * u,
          y: prev.y + (p.y - prev.y) * u,
          depth: prev.depth + (p.depth - prev.depth) * u,
          t: prev.t + (p.t - prev.t) * u,
        });
      }
    }
    out.push(p);
  });
  return out;
}

/**
 * Erases along `path` (canvas units; one point erases a dot) with the given radius.
 * A point of a stroke is erased when the eraser reaches its drawn edge: within
 * `radius` plus half the stroke's width. Pieces shorter than two points are dropped.
 */
export function eraseStrokes(
  strokes: readonly Stroke[],
  path: readonly Vec2[],
  radius: number,
  createId: () => string,
): EraseResult {
  const removed: Stroke[] = [];
  const added: Stroke[] = [];
  const first = path[0];
  if (!first) return { removed, added };
  const segments: Array<[Vec2, Vec2]> =
    path.length === 1 ? [[first, first]] : path.slice(1).map((p, i) => [path[i]!, p]);
  const reach = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of path) {
    reach.minX = Math.min(reach.minX, p.x - radius);
    reach.minY = Math.min(reach.minY, p.y - radius);
    reach.maxX = Math.max(reach.maxX, p.x + radius);
    reach.maxY = Math.max(reach.maxY, p.y + radius);
  }

  for (const s of strokes) {
    if (s.points.length === 0) continue;
    const box = strokeBox(s);
    const margin = s.size * 1.1; // the widest a stroke is drawn (depth 2.2)
    if (
      box.maxX + margin < reach.minX ||
      box.minX - margin > reach.maxX ||
      box.maxY + margin < reach.minY ||
      box.minY - margin > reach.maxY
    ) {
      continue;
    }
    const points = subdivide(densify(s.points, SMOOTHING), Math.max(0.5, radius / 2));
    const erased = points.map((p) => segments.some(([a, b]) => distToSegment(p, a, b) <= radius + halfWidth(s, p)));
    if (!erased.includes(true)) continue;

    removed.push(s);
    let run: StrokePoint[] = [];
    const keep = () => {
      if (run.length >= 2) added.push({ ...s, id: createId(), points: run });
      run = [];
    };
    points.forEach((p, i) => {
      if (erased[i]) keep();
      else run.push(p);
    });
    keep();
  }
  return { removed, added };
}
