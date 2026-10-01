// The ribbon brush: a broad pen nib, seen as a ribbon of light. The nib is the hand's
// knuckle line. The ribbon is as wide as the nib looks from the path's side: full width
// moving across the nib, thin moving along it, and where the hand turns the nib through
// the path the ribbon narrows to its edge and widens again, which reads as a twist
// (ADR 0011).
//
// The strip stays perpendicular to the path, like the neon strip. Offsetting points along
// the nib itself draws the same outline in theory, but as long overlapping slivers wherever
// the nib runs near the path, and their bright rims alias into a sawtooth.

import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import { densify, type Stroke, type StrokePoint } from '@afterglow/core';
import { clampDepth, SPACING } from './strip';

/** The nib angle without a hand (mouse, pen): a classic italic slant, rising to the right (y points down). */
export const DEFAULT_NIB_ANGLE = -Math.PI / 4;
/** Even moving exactly along the nib, the ribbon keeps this much of its half-width across the path. */
export const MIN_THICKNESS = 0.18;
/**
 * The path's direction is measured this many densified points either side (about ±10
 * canvas units). The width depends on it, and a slow hand's path changes direction
 * noisily over a few units, which would bead the ribbon.
 */
const DIRECTION_SPAN = 4;

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

export function buildNib(stroke: Stroke, widthScale = 1): BufferGeometry {
  const pts = smoothPath(densify(stroke.points, SPACING));
  const first = pts[0];
  if (!first) return new BufferGeometry();
  const color = new Color(stroke.color);
  const position: number[] = [];
  const across: number[] = [];
  const time: number[] = [];
  const bright: number[] = [];
  const tint: number[] = [];
  const index: number[] = [];
  let count = 0;

  // At most size × depth / 2, as for the other brushes, so the eraser's reach holds.
  const halfWidth = (p: StrokePoint) => stroke.size * widthScale * clampDepth(p.depth) * 0.5;
  const vertex = (x: number, y: number, a: number, p: StrokePoint, facing: number): number => {
    position.push(x, y, 0);
    across.push(a);
    time.push(p.t);
    // The broad side catches more light than the edge.
    bright.push((0.55 + 0.45 * clampDepth(p.depth)) * (0.7 + 0.3 * facing));
    tint.push(color.r, color.g, color.b);
    return count++;
  };

  if (pts.length === 1) {
    // A dab: one nib-shaped quad.
    const a = first.angle ?? DEFAULT_NIB_ANGLE;
    const h = halfWidth(first);
    const nx = Math.cos(a) * h;
    const ny = Math.sin(a) * h;
    const tx = -Math.sin(a) * h * MIN_THICKNESS;
    const ty = Math.cos(a) * h * MIN_THICKNESS;
    const v0 = vertex(first.x - nx - tx, first.y - ny - ty, -1, first, 1);
    const v1 = vertex(first.x + nx - tx, first.y + ny - ty, 1, first, 1);
    const v2 = vertex(first.x + nx + tx, first.y + ny + ty, 1, first, 1);
    const v3 = vertex(first.x - nx + tx, first.y - ny + ty, -1, first, 1);
    index.push(v0, v1, v2, v0, v2, v3);
  } else {
    let px = 0;
    let py = 1;
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - DIRECTION_SPAN)]!;
      const next = pts[Math.min(pts.length - 1, i + DIRECTION_SPAN)]!;
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy);
      if (len > 1e-6) {
        px = -dy / len;
        py = dx / len;
      }
      const p = pts[i]!;
      const a = p.angle ?? DEFAULT_NIB_ANGLE;
      // How much of the nib faces across the path: 1 when it's square to it, 0 along it.
      const facing = Math.abs(Math.cos(a) * px + Math.sin(a) * py);
      const w = halfWidth(p) * Math.max(MIN_THICKNESS, facing);
      const left = vertex(p.x + px * w, p.y + py * w, -1, p, facing);
      const right = vertex(p.x - px * w, p.y - py * w, 1, p, facing);
      if (i > 0) index.push(left - 2, right - 2, left, right - 2, right, left);
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(position, 3));
  geo.setAttribute('aAcross', new Float32BufferAttribute(across, 1));
  geo.setAttribute('aTime', new Float32BufferAttribute(time, 1));
  geo.setAttribute('aBright', new Float32BufferAttribute(bright, 1));
  geo.setAttribute('aColor', new Float32BufferAttribute(tint, 3));
  geo.setIndex(index);
  return geo;
}
