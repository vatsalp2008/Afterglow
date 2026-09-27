// Stroke geometry: a triangle ribbon along the densified path with round caps.
// `aAcross` runs -1..1 across the ribbon and 0..1 from cap center to rim, so the
// fragment shader can shade a hot core and soft edge from |aAcross| alone.

import { BufferGeometry, Color, Float32BufferAttribute } from 'three';
import { densify } from '../core/stroke/catmullRom';
import type { Stroke, StrokePoint } from '../core/types';

const SPACING = 2.5;
const CAP_SEGMENTS = 8;
const DISC_SEGMENTS = 16;

const clampDepth = (d: number) => Math.min(2.2, Math.max(0.4, d));

export function buildRibbon(stroke: Stroke, widthScale: number): BufferGeometry {
  const pts = densify(stroke.points, SPACING);
  const color = new Color(stroke.color);
  const position: number[] = [];
  const across: number[] = [];
  const time: number[] = [];
  const bright: number[] = [];
  const tint: number[] = [];
  const index: number[] = [];
  let count = 0;

  const halfWidth = (p: StrokePoint) => stroke.size * widthScale * clampDepth(p.depth) * 0.5;
  const vertex = (x: number, y: number, a: number, p: StrokePoint): number => {
    position.push(x, y, 0);
    across.push(a);
    time.push(p.t);
    bright.push(0.55 + 0.45 * clampDepth(p.depth));
    tint.push(color.r, color.g, color.b);
    return count++;
  };
  const fan = (p: StrokePoint, fromAngle: number, sweep: number, segments: number) => {
    const h = halfWidth(p);
    const center = vertex(p.x, p.y, 0, p);
    let prev = -1;
    for (let k = 0; k <= segments; k++) {
      const a = fromAngle + (sweep * k) / segments;
      const rim = vertex(p.x + Math.cos(a) * h, p.y + Math.sin(a) * h, 1, p);
      if (prev >= 0) index.push(center, prev, rim);
      prev = rim;
    }
  };

  const first = pts[0];
  if (!first) return new BufferGeometry();
  if (pts.length === 1) {
    fan(first, 0, Math.PI * 2, DISC_SEGMENTS);
  } else {
    let nx = 0;
    let ny = 1;
    const normals: Array<[number, number]> = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)]!;
      const next = pts[Math.min(pts.length - 1, i + 1)]!;
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const len = Math.hypot(tx, ty);
      if (len > 1e-6) {
        nx = -ty / len;
        ny = tx / len;
      }
      normals.push([nx, ny]);
      const p = pts[i]!;
      const h = halfWidth(p);
      const left = vertex(p.x + nx * h, p.y + ny * h, -1, p);
      const right = vertex(p.x - nx * h, p.y - ny * h, 1, p);
      if (i > 0) index.push(left - 2, right - 2, left, right - 2, right, left);
    }
    // Rotating the normal by +90° points backwards along the path, -90° forwards.
    const [n0x, n0y] = normals[0]!;
    const [n1x, n1y] = normals[normals.length - 1]!;
    fan(first, Math.atan2(n0y, n0x), Math.PI, CAP_SEGMENTS);
    fan(pts[pts.length - 1]!, Math.atan2(n1y, n1x), -Math.PI, CAP_SEGMENTS);
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
