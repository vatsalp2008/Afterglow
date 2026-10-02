// Least-squares fits of lines, circles, and ellipses to points, and corner finding on
// closed paths: the geometry that turns a recognized stroke into a clean shape.

import type { Vec2 } from '../../types.ts';
import { centroid, distance, resample, simplify } from './path.ts';

export interface Axes {
  center: Vec2;
  /** Angle of the major axis. */
  angle: number;
  /** Variance along the major and minor axes. */
  major: number;
  minor: number;
}

/** The principal axes of a point set (the eigenvectors of its covariance). */
export function principalAxes(points: readonly Vec2[]): Axes {
  const center = centroid(points);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const n = Math.max(1, points.length);
  sxx /= n;
  syy /= n;
  sxy /= n;
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const mean = (sxx + syy) / 2;
  const spread = Math.hypot((sxx - syy) / 2, sxy);
  return { center, angle, major: mean + spread, minor: Math.max(0, mean - spread) };
}

export interface LineFit {
  center: Vec2;
  /** Unit direction. */
  dir: Vec2;
  /** Root-mean-square distance of the points from the line. */
  rms: number;
}

/** Total least squares: the line minimizing perpendicular distances. */
export function fitLine(points: readonly Vec2[]): LineFit {
  const axes = principalAxes(points);
  return {
    center: axes.center,
    dir: { x: Math.cos(axes.angle), y: Math.sin(axes.angle) },
    rms: Math.sqrt(axes.minor),
  };
}

/** Where `p` falls on a fitted line. */
export function projectOnLine(p: Vec2, line: LineFit): Vec2 {
  const t = (p.x - line.center.x) * line.dir.x + (p.y - line.center.y) * line.dir.y;
  return { x: line.center.x + line.dir.x * t, y: line.center.y + line.dir.y * t };
}

/** Where two fitted lines cross, or null when they're (nearly) parallel. */
export function intersectLines(a: LineFit, b: LineFit): Vec2 | null {
  const det = a.dir.x * b.dir.y - a.dir.y * b.dir.x;
  if (Math.abs(det) < 1e-6) return null;
  const dx = b.center.x - a.center.x;
  const dy = b.center.y - a.center.y;
  const t = (dx * b.dir.y - dy * b.dir.x) / det;
  return { x: a.center.x + a.dir.x * t, y: a.center.y + a.dir.y * t };
}

export interface CircleFit {
  center: Vec2;
  radius: number;
  /** Root-mean-square radial error, relative to the radius. */
  relativeRms: number;
}

/** Kåsa's algebraic circle fit, in centered coordinates for stability. */
export function fitCircle(points: readonly Vec2[]): CircleFit {
  const c = centroid(points);
  // Solve [Σuu Σuv; Σuv Σvv] [a; b] = ½ [Σu(uu+vv); Σv(uu+vv)] for the center offset.
  let suu = 0;
  let svv = 0;
  let suv = 0;
  let su3 = 0;
  let sv3 = 0;
  for (const p of points) {
    const u = p.x - c.x;
    const v = p.y - c.y;
    const r2 = u * u + v * v;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    su3 += u * r2;
    sv3 += v * r2;
  }
  const det = suu * svv - suv * suv;
  const a = det === 0 ? 0 : (0.5 * (su3 * svv - sv3 * suv)) / det;
  const b = det === 0 ? 0 : (0.5 * (sv3 * suu - su3 * suv)) / det;
  const center = { x: c.x + a, y: c.y + b };
  const radii = points.map((p) => distance(p, center));
  const radius = radii.reduce((s, r) => s + r, 0) / Math.max(1, radii.length);
  const rms = Math.sqrt(radii.reduce((s, r) => s + (r - radius) ** 2, 0) / Math.max(1, radii.length));
  return { center, radius, relativeRms: radius > 0 ? rms / radius : Infinity };
}

export interface EllipseFit {
  center: Vec2;
  angle: number;
  /** Semi-axes, major first. */
  rx: number;
  ry: number;
  /** Root-mean-square error of the normalized radius (1 on the ellipse). */
  relativeRms: number;
}

/**
 * An ellipse on the principal axes of an evenly resampled closed path: the center and
 * orientation come from the axes, the semi-axes from a least-squares fit of
 * u²/rx² + v²/ry² = 1 (linear in 1/rx² and 1/ry²).
 */
export function fitEllipse(closed: readonly Vec2[]): EllipseFit {
  const axes = principalAxes(closed);
  const cos = Math.cos(-axes.angle);
  const sin = Math.sin(-axes.angle);
  const local = closed.map((p) => {
    const dx = p.x - axes.center.x;
    const dy = p.y - axes.center.y;
    return { u2: (dx * cos - dy * sin) ** 2, v2: (dx * sin + dy * cos) ** 2 };
  });
  let suu = 0;
  let suv = 0;
  let svv = 0;
  let su = 0;
  let sv = 0;
  for (const { u2, v2 } of local) {
    suu += u2 * u2;
    suv += u2 * v2;
    svv += v2 * v2;
    su += u2;
    sv += v2;
  }
  const det = suu * svv - suv * suv;
  const a = det === 0 ? 0 : (su * svv - sv * suv) / det;
  const b = det === 0 ? 0 : (sv * suu - su * suv) / det;
  if (a <= 0 || b <= 0) return { center: axes.center, angle: axes.angle, rx: 0, ry: 0, relativeRms: Infinity };
  let err = 0;
  for (const { u2, v2 } of local) err += (Math.sqrt(a * u2 + b * v2) - 1) ** 2;
  // a ≤ b means the u axis (the principal one) is the longer.
  const [rx, ry] = [1 / Math.sqrt(a), 1 / Math.sqrt(b)];
  return {
    center: axes.center,
    angle: rx >= ry ? axes.angle : axes.angle + Math.PI / 2,
    rx: Math.max(rx, ry),
    ry: Math.min(rx, ry),
    relativeRms: Math.sqrt(err / Math.max(1, local.length)),
  };
}

/** How sharply a path turns at `b` coming from `a` and going to `c`, in radians (0 = straight on). */
export function turnAngle(a: Vec2, b: Vec2, c: Vec2): number {
  const a1 = Math.atan2(b.y - a.y, b.x - a.x);
  const a2 = Math.atan2(c.y - b.y, c.x - b.x);
  let d = a2 - a1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

/**
 * The corners of a closed path, in drawing order, as indices into `ring` (an evenly
 * resampled path whose last point meets its first). Douglas–Peucker runs on both halves
 * of the loop, split at the point farthest from the start, so the start needn't be a
 * corner. Vertices turning less than `minTurn` are dropped.
 */
export function closedCorners(ring: readonly Vec2[], epsilon: number, minTurn: number): number[] {
  const n = ring.length - 1;
  if (n < 4) return [];
  const first = ring[0]!;
  let far = 1;
  for (let i = 1; i < n; i++) if (distance(ring[i]!, first) > distance(ring[far]!, first)) far = i;
  // The ring's last point is its first (the same object), so it's left out of the index.
  const indexOf = new Map(ring.slice(0, n).map((p, i) => [p, i]));
  const halfA = simplify(ring.slice(0, far + 1), epsilon);
  const halfB = simplify(ring.slice(far, n + 1), epsilon);
  const vertices = [...halfA, ...halfB.slice(1, -1)].map((p) => indexOf.get(p)!);
  const corners: number[] = [];
  for (let k = 0; k < vertices.length; k++) {
    const prev = ring[vertices[(k - 1 + vertices.length) % vertices.length]!]!;
    const here = ring[vertices[k]!]!;
    const next = ring[vertices[(k + 1) % vertices.length]!]!;
    if (turnAngle(prev, here, next) >= minTurn) corners.push(vertices[k]!);
  }
  return corners;
}

/** A closed path resampled evenly into `n` steps, ending where it starts. */
export function ringOf(closed: readonly Vec2[], n: number): Vec2[] {
  const ring = resample([...closed, closed[0]!], n + 1);
  ring[n] = ring[0]!;
  return ring;
}

/** Lines fitted to each side between consecutive corners, ignoring the rounded ends near corners. */
export function sideLines(ring: readonly Vec2[], corners: readonly number[]): LineFit[] {
  const n = ring.length - 1;
  return corners.map((from, k) => {
    const to = corners[(k + 1) % corners.length]!;
    const span = (to - from + n) % n;
    const trim = Math.floor(span * 0.2);
    const side: Vec2[] = [];
    for (let s = trim; s <= span - trim; s++) side.push(ring[(from + s) % n]!);
    return fitLine(side.length >= 2 ? side : [ring[from]!, ring[to % n]!]);
  });
}
