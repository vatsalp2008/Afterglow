// Centripetal Catmull-Rom densification. Camera input arrives at ~30 Hz, so a
// fast hand leaves big gaps between samples; this fills them with a smooth
// curve through every sample. Centripetal parameterization (alpha = 0.5) avoids
// the cusps and self-loops the uniform variant makes on unevenly spaced points.

import { lerpAxial } from './angle.ts';
import type { StrokePoint, Vec2 } from '../types.ts';

const EPS = 1e-4;

function knot(a: Vec2, b: Vec2): number {
  return Math.max(Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)), EPS);
}

function lerp2(a: Vec2, b: Vec2, ta: number, tb: number, t: number): Vec2 {
  const w = (t - ta) / (tb - ta);
  return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
}

/** Point on the centripetal spline between p1 and p2, u in [0, 1]. Barry-Goldman form. */
export function centripetal(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, u: number): Vec2 {
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const t = t1 + (t2 - t1) * u;
  const a1 = lerp2(p0, p1, t0, t1, t);
  const a2 = lerp2(p1, p2, t1, t2, t);
  const a3 = lerp2(p2, p3, t2, t3, t);
  const b1 = lerp2(a1, a2, t0, t2, t);
  const b2 = lerp2(a2, a3, t1, t3, t);
  return lerp2(b1, b2, t1, t2, t);
}

function reflect(a: StrokePoint, b: StrokePoint): StrokePoint {
  return { x: 2 * a.x - b.x, y: 2 * a.y - b.y, depth: a.depth, t: a.t };
}

/** The nib angle between two points, the short way round; either one's angle if only it has one. */
export function interpolateAngle(a: StrokePoint, b: StrokePoint, u: number): number | undefined {
  if (a.angle === undefined) return b.angle;
  if (b.angle === undefined) return a.angle;
  return lerpAxial(a.angle, b.angle, u);
}

/** Resamples so consecutive points are at most ~`spacing` canvas units apart. */
export function densify(points: readonly StrokePoint[], spacing: number): StrokePoint[] {
  if (points.length < 2) return points.slice();
  const out: StrokePoint[] = [points[0]!];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p0 = points[i - 1] ?? reflect(p1, p2);
    const p3 = points[i + 2] ?? reflect(p2, p1);
    const steps = Math.min(64, Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / spacing)));
    for (let s = 1; s <= steps; s++) {
      const u = s / steps;
      const q = s === steps ? p2 : centripetal(p0, p1, p2, p3, u);
      const point: StrokePoint = {
        x: q.x,
        y: q.y,
        depth: p1.depth + (p2.depth - p1.depth) * u,
        t: p1.t + (p2.t - p1.t) * u,
      };
      const angle = interpolateAngle(p1, p2, u);
      if (angle !== undefined) point.angle = angle;
      out.push(point);
    }
  }
  return out;
}
