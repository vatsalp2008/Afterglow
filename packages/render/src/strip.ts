// Stroke geometry for neon, sparks, and ink: a triangle strip along the densified path
// with round caps.
// `aAcross` runs -1..1 across the ribbon and 0..1 from cap center to rim, so the
// fragment shader can shade a hot core and soft edge from |aAcross| alone.

import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import type { Stroke, StrokePoint } from '@afterglow/core';
import { clampDepth, stripSections } from './outline';

const CAP_SEGMENTS = 8;
const DISC_SEGMENTS = 16;

/** `intensity` scales the brightness, so brushes can share a material (the sparks core runs hotter). */
export function buildStrip(stroke: Stroke, widthScale: number, intensity = 1): BufferGeometry {
  const sections = stripSections(stroke, widthScale);
  const color = new Color(stroke.color);
  const position: number[] = [];
  const across: number[] = [];
  const time: number[] = [];
  const bright: number[] = [];
  const tint: number[] = [];
  const index: number[] = [];
  let count = 0;

  const vertex = (x: number, y: number, a: number, p: StrokePoint): number => {
    position.push(x, y, 0);
    across.push(a);
    time.push(p.t);
    bright.push((0.55 + 0.45 * clampDepth(p.depth)) * intensity);
    tint.push(color.r, color.g, color.b);
    return count++;
  };
  const fan = (p: StrokePoint, h: number, fromAngle: number, sweep: number, segments: number) => {
    const center = vertex(p.x, p.y, 0, p);
    let prev = -1;
    for (let k = 0; k <= segments; k++) {
      const a = fromAngle + (sweep * k) / segments;
      const rim = vertex(p.x + Math.cos(a) * h, p.y + Math.sin(a) * h, 1, p);
      if (prev >= 0) index.push(center, prev, rim);
      prev = rim;
    }
  };

  const first = sections[0];
  const last = sections[sections.length - 1];
  if (!first || !last) return new BufferGeometry();
  if (sections.length === 1) {
    fan(first.point, first.half, 0, Math.PI * 2, DISC_SEGMENTS);
  } else {
    sections.forEach(({ point: p, nx, ny, half: h }, i) => {
      const left = vertex(p.x + nx * h, p.y + ny * h, -1, p);
      const right = vertex(p.x - nx * h, p.y - ny * h, 1, p);
      if (i > 0) index.push(left - 2, right - 2, left, right - 2, right, left);
    });
    // Rotating the normal by +90° points backwards along the path, -90° forwards.
    fan(first.point, first.half, Math.atan2(first.ny, first.nx), Math.PI, CAP_SEGMENTS);
    fan(last.point, last.half, Math.atan2(last.ny, last.nx), -Math.PI, CAP_SEGMENTS);
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
