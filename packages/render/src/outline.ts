// Where a stroke's edges are, shared by the GPU geometry (strip.ts, nib.ts) and the SVG
// export (svg.ts), so a saved SVG has exactly the shapes on screen. No Three.js here.

import { densify, type Stroke, type StrokePoint, type Vec2 } from '@afterglow/core';

/** Canvas units between densified points. */
export const SPACING = 2.5;

export const clampDepth = (d: number) => Math.min(2.2, Math.max(0.4, d));

/** The nib angle without a hand (mouse, pen): a classic italic slant, rising to the right (y points down). */
export const DEFAULT_NIB_ANGLE = -Math.PI / 4;
/** Even moving exactly along the nib, the ribbon keeps this much of its half-width across the path. */
export const MIN_THICKNESS = 0.18;
/**
 * The path's direction is measured this many densified points either side (about ±10
 * canvas units). The ribbon's width depends on it, and a slow hand's path changes
 * direction noisily over a few units, which would bead the ribbon.
 */
const DIRECTION_SPAN = 4;

/**
 * A cross-section of a stroke at one densified point. Its left edge is
 * point + n × half and its right edge point − n × half.
 */
export interface Section {
  point: StrokePoint;
  /** Unit normal of the path. */
  nx: number;
  ny: number;
  half: number;
  /** Ribbon only: how much of the nib faces across the path, 1 square to it, 0 along it. */
  facing: number;
}

/** Half the drawn width at a point: size × depth / 2, scaled per brush. */
const halfWidth = (stroke: Stroke, widthScale: number, p: StrokePoint) =>
  stroke.size * widthScale * clampDepth(p.depth) * 0.5;

/**
 * The neon, sparks, and ink strip: perpendicular to the path at every densified point,
 * with round caps of the end sections' half-width. A single point is a disc.
 */
export function stripSections(stroke: Stroke, widthScale: number): Section[] {
  const pts = densify(stroke.points, SPACING);
  let nx = 0;
  let ny = 1;
  return pts.map((p, i) => {
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(pts.length - 1, i + 1)]!;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty);
    if (len > 1e-6) {
      nx = -ty / len;
      ny = tx / len;
    }
    return { point: p, nx, ny, half: halfWidth(stroke, widthScale, p), facing: 1 };
  });
}

/**
 * Smooths positions along an already densified path with a small centered kernel (about
 * ±5 canvas units), keeping each point's depth, time, and angle. A slow hand moves about
 * 2.6 units a frame, and its pen point wanders 0.5 units off its path at the median (2.4
 * at p95, fixture 02). A neon glow hides that; a ribbon's crisp rims show it as jagged edges.
 */
export function smoothPath(points: readonly StrokePoint[]): StrokePoint[] {
  const weights = [1, 2, 3, 2, 1];
  return points.map((p, i) => {
    let x = 0;
    let y = 0;
    let w = 0;
    weights.forEach((k, j) => {
      const q = points[i + j - 2];
      if (!q) return;
      x += q.x * k;
      y += q.y * k;
      w += k;
    });
    return { ...p, x: x / w, y: y / w };
  });
}

/**
 * The ribbon: as wide as the nib looks from the side of the path (ADR 0011), at least
 * MIN_THICKNESS of its half-width. One point gives one section; draw it with `nibDab`.
 */
export function nibSections(stroke: Stroke, widthScale = 1): Section[] {
  const pts = smoothPath(densify(stroke.points, SPACING));
  let px = 0;
  let py = 1;
  return pts.map((p, i) => {
    const prev = pts[Math.max(0, i - DIRECTION_SPAN)]!;
    const next = pts[Math.min(pts.length - 1, i + DIRECTION_SPAN)]!;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) {
      px = -dy / len;
      py = dx / len;
    }
    const a = p.angle ?? DEFAULT_NIB_ANGLE;
    const facing = Math.abs(Math.cos(a) * px + Math.sin(a) * py);
    return {
      point: p,
      nx: px,
      ny: py,
      half: halfWidth(stroke, widthScale, p) * Math.max(MIN_THICKNESS, facing),
      facing,
    };
  });
}

/** A ribbon of one point: a nib-shaped quad, MIN_THICKNESS thick, along the nib's angle. */
export function nibDab(stroke: Stroke, point: StrokePoint, widthScale = 1): [Vec2, Vec2, Vec2, Vec2] {
  const a = point.angle ?? DEFAULT_NIB_ANGLE;
  const h = halfWidth(stroke, widthScale, point);
  const nx = Math.cos(a) * h;
  const ny = Math.sin(a) * h;
  const tx = -Math.sin(a) * h * MIN_THICKNESS;
  const ty = Math.cos(a) * h * MIN_THICKNESS;
  return [
    { x: point.x - nx - tx, y: point.y - ny - ty },
    { x: point.x + nx - tx, y: point.y + ny - ty },
    { x: point.x + nx + tx, y: point.y + ny + ty },
    { x: point.x - nx + tx, y: point.y - ny + ty },
  ];
}
