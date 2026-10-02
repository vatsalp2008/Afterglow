// Shape snapping (ADR 0014): when a stroke ends, a rough line, circle, ellipse,
// rectangle, triangle, or arrow is replaced by a clean one. A straight stroke is a
// line by its geometry alone; anything else is recognized by $1 first, then confirmed
// by fitting the shape. Snapping favors precision: a loose stroke left alone costs
// nothing, a scribble turned into a circle is a surprise. One stroke at a time.

import type { ShapeKind, Stroke, StrokePoint, Vec2 } from '../../types.ts';
import { recognize, shapeTemplates } from './dollar.ts';
import {
  closedCorners,
  fitCircle,
  fitEllipse,
  fitLine,
  intersectLines,
  principalAxes,
  projectOnLine,
  ringOf,
  sideLines,
  turnAngle,
} from './fits.ts';
import { bounds, diagonal, distance, pathLength, sampleEvery, signedArea2, simplify } from './path.ts';

export interface SnapConfig {
  /** Shorter strokes are never snapped (canvas units; the frame is 1000 tall). */
  minLength: number;
  /** Chord over path length at least this: a line candidate. */
  straightness: number;
  /** A line's points stay within this root-mean-square distance, relative to its length. */
  lineResidual: number;
  /** A path is closed when it comes back within this share of its bounding box's diagonal. */
  closeGap: number;
  /** $1 score a closed stroke needs before shapes are fitted to it. */
  minScore: number;
  /** $1 score an open stroke needs as an arrow; lower, since the arrow's own check is strict. */
  minArrowScore: number;
  /** Ellipses (and circles) fit within this normalized radial error. */
  ellipseResidual: number;
  /** Minor over major semi-axis at least this: a circle. */
  roundness: number;
  /** Corners turn at least this much (radians). */
  cornerTurn: number;
  /** A rectangle's corners are within this of a right angle (radians). */
  rightAngleTolerance: number;
  /** Corner finding tolerates wobbles up to this share of the bounding box's diagonal. */
  cornerEpsilon: number;
  /** Spacing of the clean shape's points (canvas units). */
  spacing: number;
}

export const DEFAULT_SNAP: SnapConfig = {
  minLength: 60,
  straightness: 0.95,
  lineResidual: 0.025,
  closeGap: 0.2,
  minScore: 0.8,
  minArrowScore: 0.72,
  ellipseResidual: 0.12,
  roundness: 0.85,
  cornerTurn: (35 * Math.PI) / 180,
  rightAngleTolerance: (25 * Math.PI) / 180,
  cornerEpsilon: 0.06,
  spacing: 2.5,
};

/** A recognized shape: one clean path, or two for an arrow (its shaft and first barb, then its second barb). */
export interface ShapeMatch {
  shape: ShapeKind;
  paths: Vec2[][];
}

const TEMPLATES = shapeTemplates();

function dedupe(points: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push({ x: p.x, y: p.y });
  }
  return out;
}

/**
 * The closed part of a path that comes back to its start: up to the point, in its last
 * third, nearest the start (which trims an overshoot), or null if it doesn't come back.
 */
function closedPart(points: readonly Vec2[], gap: number): Vec2[] | null {
  const first = points[0]!;
  let best = -1;
  let bestDist = gap;
  for (let i = Math.floor(points.length * 0.66); i < points.length; i++) {
    const d = distance(points[i]!, first);
    if (d <= bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return best > 0 ? points.slice(0, best + 1) : null;
}

/** Rotates a closed polygon to start at the corner nearest `start`, keeping or reversing direction to match `clockwise`. */
function orderLoop(corners: Vec2[], start: Vec2, clockwise: boolean): Vec2[] {
  const ordered = signedArea2(corners) > 0 === clockwise ? corners : [...corners].reverse();
  let first = 0;
  ordered.forEach((p, i) => {
    if (distance(p, start) < distance(ordered[first]!, start)) first = i;
  });
  const loop = [...ordered.slice(first), ...ordered.slice(0, first)];
  return [...loop, loop[0]!];
}

function ellipseLoop(
  center: Vec2,
  rx: number,
  ry: number,
  angle: number,
  start: Vec2,
  clockwise: boolean,
  spacing: number,
): Vec2[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // The parameter where the stroke began, so the clean shape starts where the hand did.
  const dx = start.x - center.x;
  const dy = start.y - center.y;
  const t0 = Math.atan2((-dx * sin + dy * cos) / Math.max(ry, 1e-9), (dx * cos + dy * sin) / Math.max(rx, 1e-9));
  const steps = Math.max(24, Math.ceil((2 * Math.PI * Math.max(rx, ry)) / spacing));
  // y points down, so a positive parameter step turns clockwise on screen.
  const dir = clockwise ? 1 : -1;
  return Array.from({ length: steps + 1 }, (_, k) => {
    const t = t0 + (dir * 2 * Math.PI * k) / steps;
    const u = rx * Math.cos(t);
    const v = ry * Math.sin(t);
    return { x: center.x + u * cos - v * sin, y: center.y + u * sin + v * cos };
  });
}

function matchLine(points: readonly Vec2[], length: number, config: SnapConfig): ShapeMatch | null {
  if (distance(points[0]!, points[points.length - 1]!) / length < config.straightness) return null;
  const line = fitLine(points);
  if (line.rms / length > config.lineResidual) return null;
  return {
    shape: 'line',
    paths: [[projectOnLine(points[0]!, line), projectOnLine(points[points.length - 1]!, line)]],
  };
}

function matchEllipse(closed: readonly Vec2[], config: SnapConfig): ShapeMatch | null {
  const ring = ringOf(closed, 96);
  const e = fitEllipse(ring.slice(0, -1));
  if (e.relativeRms > config.ellipseResidual || e.rx === 0) return null;
  const clockwise = signedArea2(closed) > 0;
  if (e.ry / e.rx >= config.roundness) {
    const c = fitCircle(ring.slice(0, -1));
    return {
      shape: 'circle',
      paths: [ellipseLoop(c.center, c.radius, c.radius, 0, closed[0]!, clockwise, config.spacing)],
    };
  }
  return {
    shape: 'ellipse',
    paths: [ellipseLoop(e.center, e.rx, e.ry, e.angle, closed[0]!, clockwise, config.spacing)],
  };
}

function matchPolygon(closed: readonly Vec2[], sides: 3 | 4, config: SnapConfig, diag: number): ShapeMatch | null {
  const ring = ringOf(closed, 96);
  const corners = closedCorners(ring, config.cornerEpsilon * diag, config.cornerTurn);
  if (corners.length !== sides) return null;
  const lines = sideLines(ring, corners);
  const vertices: Vec2[] = [];
  for (let k = 0; k < sides; k++) {
    const p = intersectLines(lines[(k - 1 + sides) % sides]!, lines[k]!);
    if (!p) return null;
    vertices.push(p);
  }
  const clockwise = signedArea2(closed) > 0;
  if (sides === 3) return { shape: 'triangle', paths: [orderLoop(vertices, closed[0]!, clockwise)] };

  for (let k = 0; k < 4; k++) {
    const turn = turnAngle(vertices[(k + 3) % 4]!, vertices[k]!, vertices[(k + 1) % 4]!);
    if (Math.abs(turn - Math.PI / 2) > config.rightAngleTolerance) return null;
  }
  // Regularized: square corners, sides along the average side direction.
  const axes = principalAxes(ring.slice(0, -1));
  let sum4x = 0;
  let sum4y = 0;
  for (const l of lines) {
    const a = 4 * Math.atan2(l.dir.y, l.dir.x);
    sum4x += Math.cos(a);
    sum4y += Math.sin(a);
  }
  const angle = Math.atan2(sum4y, sum4x) / 4;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const local = vertices.map((p) => {
    const dx = p.x - axes.center.x;
    const dy = p.y - axes.center.y;
    return { u: dx * cos + dy * sin, v: -dx * sin + dy * cos };
  });
  const us = local.map((p) => p.u).sort((a, b) => a - b);
  const vs = local.map((p) => p.v).sort((a, b) => a - b);
  // Opposite sides averaged: the two smallest coordinates are one side, the two largest the other.
  const u0 = (us[0]! + us[1]!) / 2;
  const u1 = (us[2]! + us[3]!) / 2;
  const v0 = (vs[0]! + vs[1]!) / 2;
  const v1 = (vs[2]! + vs[3]!) / 2;
  const box = [
    { u: u0, v: v0 },
    { u: u1, v: v0 },
    { u: u1, v: v1 },
    { u: u0, v: v1 },
  ].map(({ u, v }) => ({ x: axes.center.x + u * cos - v * sin, y: axes.center.y + u * sin + v * cos }));
  return { shape: 'rectangle', paths: [orderLoop(box, closed[0]!, clockwise)] };
}

/**
 * An arrow drawn in one stroke: a straight shaft to the tip, where the path turns back,
 * then barbs on both sides of the shaft, near the tip.
 */
function matchArrow(points: readonly Vec2[], length: number, diag: number): ShapeMatch | null {
  const vertices = simplify(points, 0.05 * diag);
  let tipIndex = -1;
  for (let k = 1; k < vertices.length - 1; k++) {
    if (turnAngle(vertices[k - 1]!, vertices[k]!, vertices[k + 1]!) >= (110 * Math.PI) / 180) {
      tipIndex = k;
      break;
    }
  }
  if (tipIndex < 0) return null;
  const tipPoint = vertices[tipIndex]!;
  const tipAt = points.indexOf(tipPoint);
  const shaftPoints = points.slice(0, tipAt + 1);
  const shaftLength = distance(points[0]!, tipPoint);
  if (shaftLength < 0.35 * length || shaftPoints.length < 2) return null;
  const shaft = fitLine(shaftPoints);
  if (shaft.rms > 0.05 * shaftLength) return null;

  const tail = projectOnLine(points[0]!, shaft);
  const tip = projectOnLine(tipPoint, shaft);
  const back = { x: (tail.x - tip.x) / shaftLength, y: (tail.y - tip.y) / shaftLength };
  const head = points.slice(tipAt + 1);
  if (head.some((p) => distance(p, tip) > 0.6 * shaftLength)) return null;
  // The farthest head point on each side of the shaft is that barb's end.
  let left: Vec2 | null = null;
  let right: Vec2 | null = null;
  for (const p of head) {
    const side = back.x * (p.y - tip.y) - back.y * (p.x - tip.x);
    if (side < 0 && (!left || distance(p, tip) > distance(left, tip))) left = p;
    if (side > 0 && (!right || distance(p, tip) > distance(right, tip))) right = p;
  }
  if (!left || !right) return null;
  const angleOf = (p: Vec2) => {
    const d = distance(p, tip);
    return Math.acos(Math.max(-1, Math.min(1, ((p.x - tip.x) * back.x + (p.y - tip.y) * back.y) / d)));
  };
  const angles = [angleOf(left), angleOf(right)];
  if (angles.some((a) => a < (10 * Math.PI) / 180 || a > (80 * Math.PI) / 180)) return null;
  const barbLength = Math.min(
    0.5 * shaftLength,
    Math.max(0.12 * shaftLength, (distance(left, tip) + distance(right, tip)) / 2),
  );
  const spread = (angles[0]! + angles[1]!) / 2;
  const barb = (sign: number) => {
    const a = sign * spread;
    return {
      x: tip.x + barbLength * (back.x * Math.cos(a) - back.y * Math.sin(a)),
      y: tip.y + barbLength * (back.x * Math.sin(a) + back.y * Math.cos(a)),
    };
  };
  // The barb drawn first stays with the shaft; the other is its own stroke.
  const leftFirst = head.indexOf(left) < head.indexOf(right);
  const [first, second] = leftFirst ? [barb(-1), barb(1)] : [barb(1), barb(-1)];
  return {
    shape: 'arrow',
    paths: [
      [tail, tip, first],
      [tip, second],
    ],
  };
}

/** The clean shape a stroke's path is, or null if it isn't one confidently. */
export function recognizeShape(raw: readonly Vec2[], config: SnapConfig = DEFAULT_SNAP): ShapeMatch | null {
  const points = dedupe(raw);
  const length = pathLength(points);
  if (points.length < 3 || length < config.minLength) return null;
  const line = matchLine(points, length, config);
  if (line) return line;

  const diag = diagonal(bounds(points));
  const closed = closedPart(points, config.closeGap * diag);
  const match = recognize(closed ?? points, TEMPLATES);
  if (!match) return null;
  if (!closed)
    return match.name === 'arrow' && match.score >= config.minArrowScore ? matchArrow(points, length, diag) : null;
  if (match.score < config.minScore) return null;
  // $1's favorite first; its scores for the closed shapes are close, so a fit that fails
  // passes the stroke on to the next shape.
  const fits: Record<string, () => ShapeMatch | null> = {
    circle: () => matchEllipse(closed, config),
    rectangle: () => matchPolygon(closed, 4, config, diag),
    triangle: () => matchPolygon(closed, 3, config, diag),
  };
  for (const name of [match.name, ...Object.keys(fits)]) {
    const found = fits[name]?.();
    if (found) return found;
  }
  return null;
}

/**
 * The clean strokes replacing `stroke`, or null to keep it as drawn. They keep its brush,
 * color, and size; their points are evenly spaced, at the stroke's mean depth, and timed
 * across its duration by distance, so a replay draws them at the pace the hand did.
 */
export function snapStroke(
  stroke: Stroke,
  createId: () => string,
  config: SnapConfig = DEFAULT_SNAP,
): { shape: ShapeKind; strokes: Stroke[] } | null {
  const match = recognizeShape(stroke.points, config);
  if (!match) return null;
  const raw = stroke.points;
  const t0 = raw[0]!.t;
  const t1 = raw[raw.length - 1]!.t;
  const depth = raw.reduce((s, p) => s + p.depth, 0) / raw.length;
  const rawLength = pathLength(raw);
  const rawAt: number[] = [0];
  for (let i = 1; i < raw.length; i++) rawAt.push(rawAt[i - 1]! + distance(raw[i - 1]!, raw[i]!));
  /** The nib angle where the hand was at the same share of the way along. */
  const angleAt = (share: number): number | undefined => {
    const target = share * rawLength;
    let i = 0;
    while (i < raw.length - 1 && rawAt[i + 1]! < target) i++;
    return raw[i]!.angle;
  };

  const paths = match.paths.map((p) => sampleEvery(p, config.spacing));
  const total = paths.reduce((s, p) => s + pathLength(p), 0) || 1;
  let along = 0;
  const strokes = paths.map((path): Stroke => {
    const points = path.map((p, i): StrokePoint => {
      if (i > 0) along += distance(path[i - 1]!, p);
      const share = along / total;
      const point: StrokePoint = { x: p.x, y: p.y, depth, t: t0 + (t1 - t0) * share };
      const angle = angleAt(share);
      if (angle !== undefined) point.angle = angle;
      return point;
    });
    return {
      id: createId(),
      brush: stroke.brush,
      color: stroke.color,
      size: stroke.size,
      createdAt: stroke.createdAt,
      points,
      shape: match.shape,
    };
  });
  return { shape: match.shape, strokes };
}
