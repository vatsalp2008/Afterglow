// The $1 Unistroke Recognizer (Wobbrock, Wilson and Li, 2007): a stroke is resampled,
// rotated so its first point lies on a fixed angle from its centroid, scaled into a
// square, and compared point by point with templates, searching ±45° of rotation for the
// best fit. Templates are generated here, not recorded, so the shapes snapping draws are
// the shapes it recognizes.

import type { Vec2 } from '../../types.ts';
import { centroid, distance, resample } from './path.ts';

export const DOLLAR_POINTS = 64;
const SQUARE = 250;
const HALF_DIAGONAL = 0.5 * Math.hypot(SQUARE, SQUARE);
const ANGLE_RANGE = Math.PI / 4;
const ANGLE_PRECISION = Math.PI / 90;
const PHI = 0.5 * (-1 + Math.sqrt(5));

export interface DollarTemplate {
  name: string;
  points: Vec2[];
}

function rotateBy(points: readonly Vec2[], angle: number): Vec2[] {
  const c = centroid(points);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map((p) => ({
    x: (p.x - c.x) * cos - (p.y - c.y) * sin + c.x,
    y: (p.x - c.x) * sin + (p.y - c.y) * cos + c.y,
  }));
}

function scaleToSquare(points: readonly Vec2[]): Vec2[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const w = Math.max(maxX - minX, 1e-9);
  const h = Math.max(maxY - minY, 1e-9);
  return points.map((p) => ({ x: (p.x * SQUARE) / w, y: (p.y * SQUARE) / h }));
}

function translateToOrigin(points: readonly Vec2[]): Vec2[] {
  const c = centroid(points);
  return points.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}

/** The $1 normal form of a stroke. */
export function normalize(points: readonly Vec2[]): Vec2[] {
  const sampled = resample(points, DOLLAR_POINTS);
  const c = centroid(sampled);
  const first = sampled[0]!;
  const indicative = Math.atan2(c.y - first.y, c.x - first.x);
  return translateToOrigin(scaleToSquare(rotateBy(sampled, -indicative)));
}

function pathDistance(a: readonly Vec2[], b: readonly Vec2[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += distance(a[i]!, b[i]!);
  return d / a.length;
}

function distanceAtAngle(points: readonly Vec2[], template: readonly Vec2[], angle: number): number {
  return pathDistance(rotateBy(points, angle), template);
}

/** Golden-section search for the rotation that fits best, within ±45°. */
function distanceAtBestAngle(points: readonly Vec2[], template: readonly Vec2[]): number {
  let a = -ANGLE_RANGE;
  let b = ANGLE_RANGE;
  let x1 = PHI * a + (1 - PHI) * b;
  let f1 = distanceAtAngle(points, template, x1);
  let x2 = (1 - PHI) * a + PHI * b;
  let f2 = distanceAtAngle(points, template, x2);
  while (Math.abs(b - a) > ANGLE_PRECISION) {
    if (f1 < f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = PHI * a + (1 - PHI) * b;
      f1 = distanceAtAngle(points, template, x1);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = (1 - PHI) * a + PHI * b;
      f2 = distanceAtAngle(points, template, x2);
    }
  }
  return Math.min(f1, f2);
}

export interface DollarMatch {
  name: string;
  /** 1 for a perfect match, falling toward 0. */
  score: number;
}

/** The best template for a stroke and its score, or null without templates. */
export function recognize(points: readonly Vec2[], templates: readonly DollarTemplate[]): DollarMatch | null {
  if (templates.length === 0 || points.length < 2) return null;
  const candidate = normalize(points);
  let best: DollarMatch | null = null;
  for (const t of templates) {
    const score = 1 - distanceAtBestAngle(candidate, t.points) / HALF_DIAGONAL;
    if (!best || score > best.score) best = { name: t.name, score };
  }
  return best;
}

// ---- generated templates --------------------------------------------------------

/** A closed polygon traced from vertex `start`, in either direction, back to its start. */
function polygonPath(corners: readonly Vec2[], start: number, reverse: boolean): Vec2[] {
  const n = corners.length;
  const order = Array.from({ length: n + 1 }, (_, k) => corners[(start + (reverse ? n - k : k)) % n]!);
  return order;
}

function ellipsePath(rx: number, ry: number, startAngle: number, reverse: boolean): Vec2[] {
  return Array.from({ length: 65 }, (_, k) => {
    const a = startAngle + ((reverse ? -1 : 1) * 2 * Math.PI * k) / 64;
    return { x: rx * Math.cos(a), y: ry * Math.sin(a) };
  });
}

/**
 * An arrow drawn as one stroke: the shaft, then the barbs (out and back, or across),
 * with barbs from short to long against the shaft.
 */
function arrowPaths(): Vec2[][] {
  const paths: Vec2[][] = [];
  for (const barb of [0.12, 0.25, 0.4]) {
    const tail = { x: 0, y: 0 };
    const tip = { x: 100, y: 0 };
    const back = 100 * barb * Math.cos(Math.PI / 6);
    const side = 100 * barb * Math.sin(Math.PI / 6);
    const left = { x: 100 - back, y: -side };
    const right = { x: 100 - back, y: side };
    paths.push(
      [tail, tip, left, tip, right],
      [tail, tip, right, tip, left],
      [tail, tip, left, right, tip],
      [tail, tip, right, left, tip],
    );
  }
  return paths;
}

function template(name: string, path: readonly Vec2[]): DollarTemplate {
  return { name, points: normalize(path) };
}

/** Circle (ellipses normalize to circles), rectangle, triangle, and arrow, drawn every likely way. */
export function shapeTemplates(): DollarTemplate[] {
  const out: DollarTemplate[] = [];
  for (const reverse of [false, true]) {
    for (let k = 0; k < 4; k++) out.push(template('circle', ellipsePath(100, 100, (k * Math.PI) / 2, reverse)));
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    for (let k = 0; k < 4; k++) out.push(template('rectangle', polygonPath(square, k, reverse)));
    const triangles = [
      [
        { x: 50, y: 0 },
        { x: 100, y: 87 },
        { x: 0, y: 87 },
      ],
      [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
    ];
    for (const tri of triangles) {
      for (let k = 0; k < 3; k++) out.push(template('triangle', polygonPath(tri, k, reverse)));
    }
  }
  for (const path of arrowPaths()) out.push(template('arrow', path));
  return out;
}
