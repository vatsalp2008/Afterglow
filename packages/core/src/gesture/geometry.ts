// Hand geometry in "units": landmark coordinates rescaled so x and y share a scale
// (frame-height units). Landmark x is normalized by width, y by height, and z is
// roughly x-scaled, so x and z are multiplied by the frame aspect (width / height).

import type { Vec3 } from '../types.ts';

export function toUnits(p: Vec3, aspect: number): Vec3 {
  return { x: p.x * aspect, y: p.y, z: p.z * aspect };
}

export function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function distToSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const len2 = ab.x ** 2 + ab.y ** 2 + ab.z ** 2;
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / len2));
  return dist(p, { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t });
}

/** How extended a finger is: tip-to-wrist over knuckle-to-wrist (about 2 straight, under 1.2 curled). */
export function extension(units: readonly Vec3[], tip: number, knuckle: number): number {
  const wrist = units[0]!;
  return dist(units[tip]!, wrist) / Math.max(dist(units[knuckle]!, wrist), 1e-6);
}
