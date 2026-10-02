// Small geometry on polylines, shared by shape snapping and the doodle rasterizer.

import type { Vec2 } from '../../types.ts';

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);

export function pathLength(points: readonly Vec2[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += distance(points[i - 1]!, points[i]!);
  return length;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bounds(points: readonly Vec2[]): Bounds {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of points) {
    b.minX = Math.min(b.minX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxX = Math.max(b.maxX, p.x);
    b.maxY = Math.max(b.maxY, p.y);
  }
  return b;
}

export const diagonal = (b: Bounds): number => Math.hypot(b.maxX - b.minX, b.maxY - b.minY);

export function centroid(points: readonly Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/** `n` points evenly spaced along the path (the first and last are the path's own). */
export function resample(points: readonly Vec2[], n: number): Vec2[] {
  const first = points[0];
  if (!first) return [];
  const total = pathLength(points);
  if (total === 0 || n < 2) return Array.from({ length: Math.max(1, n) }, () => ({ x: first.x, y: first.y }));
  const step = total / (n - 1);
  const out: Vec2[] = [{ x: first.x, y: first.y }];
  let carried = 0;
  for (let i = 1; i < points.length && out.length < n; i++) {
    let a = points[i - 1]!;
    const b = points[i]!;
    let seg = distance(a, b);
    while (carried + seg >= step && out.length < n) {
      const u = (step - carried) / seg;
      const p = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      out.push(p);
      a = p;
      seg = distance(a, b);
      carried = 0;
    }
    carried += seg;
  }
  const last = points[points.length - 1]!;
  while (out.length < n) out.push({ x: last.x, y: last.y });
  return out;
}

/** Points along a polyline every `spacing` units, ending exactly at its last point. */
export function sampleEvery(points: readonly Vec2[], spacing: number): Vec2[] {
  const total = pathLength(points);
  return resample(points, Math.max(2, Math.ceil(total / spacing) + 1));
}

/** Twice the signed area: positive when the path turns clockwise on screen (y down). */
export function signedArea2(points: readonly Vec2[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area;
}

/** Douglas–Peucker simplification of an open polyline; keeps the first and last points. */
export function simplify(points: readonly Vec2[], epsilon: number): Vec2[] {
  if (points.length < 3) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop()!;
    let worst = -1;
    let worstDist = epsilon;
    for (let i = from + 1; i < to; i++) {
      const d = distanceToLine(points[i]!, points[from]!, points[to]!);
      if (d > worstDist) {
        worst = i;
        worstDist = d;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([from, worst], [worst, to]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** Distance from `p` to the segment a–b. */
export function distanceToLine(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
