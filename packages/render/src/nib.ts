// The ribbon brush: a broad pen nib, seen as a ribbon of light. The nib is the hand's
// knuckle line. The ribbon is as wide as the nib looks from the path's side: full width
// moving across the nib, thin moving along it, and where the hand turns the nib through
// the path the ribbon narrows to its edge and widens again, which reads as a twist
// (ADR 0011). The widths are computed in outline.ts.
//
// The strip stays perpendicular to the path, like the neon strip. Offsetting points along
// the nib itself draws the same outline in theory, but as long overlapping slivers wherever
// the nib runs near the path, and their bright rims alias into a sawtooth.

import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import type { Stroke, StrokePoint } from '@afterglow/core';
import { clampDepth, nibDab, nibSections } from './outline';

export { DEFAULT_NIB_ANGLE, MIN_THICKNESS, smoothPath } from './outline';

export function buildNib(stroke: Stroke, widthScale = 1): BufferGeometry {
  const sections = nibSections(stroke, widthScale);
  const first = sections[0];
  if (!first) return new BufferGeometry();
  const color = new Color(stroke.color);
  const position: number[] = [];
  const across: number[] = [];
  const time: number[] = [];
  const bright: number[] = [];
  const tint: number[] = [];
  const index: number[] = [];
  let count = 0;

  const vertex = (x: number, y: number, a: number, p: StrokePoint, facing: number): number => {
    position.push(x, y, 0);
    across.push(a);
    time.push(p.t);
    // The broad side catches more light than the edge.
    bright.push((0.55 + 0.45 * clampDepth(p.depth)) * (0.7 + 0.3 * facing));
    tint.push(color.r, color.g, color.b);
    return count++;
  };

  if (sections.length === 1) {
    const p = first.point;
    const [c0, c1, c2, c3] = nibDab(stroke, p, widthScale);
    const v0 = vertex(c0.x, c0.y, -1, p, 1);
    const v1 = vertex(c1.x, c1.y, 1, p, 1);
    const v2 = vertex(c2.x, c2.y, 1, p, 1);
    const v3 = vertex(c3.x, c3.y, -1, p, 1);
    index.push(v0, v1, v2, v0, v2, v3);
  } else {
    sections.forEach(({ point: p, nx, ny, half: w, facing }, i) => {
      const left = vertex(p.x + nx * w, p.y + ny * w, -1, p, facing);
      const right = vertex(p.x - nx * w, p.y - ny * w, 1, p, facing);
      if (i > 0) index.push(left - 2, right - 2, left, right - 2, right, left);
    });
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
