// Strokes to the 28x28 image the doodle model sees: the same steps as
// ml/src/afterglow_ml/raster.py, so the model sees in the studio the pixels it was trained
// on. Both are tested against fixtures/doodle-raster-parity.json (ADR 0015).
//
// 1. prepareDoodle: Quick, Draw!'s simplified form. Aligned to the top left, the longer
//    side scaled to 0-255, simplified with Douglas-Peucker at 2 units.
// 2. rasterizeDoodle: fitted into the image with a 2-pixel margin and centered, lines about
//    2 pixels wide with a soft 1-pixel edge.

import { distanceToLine, simplify } from '../stroke/snap/path.ts';
import type { Vec2 } from '../types.ts';

export const DOODLE_SIZE = 28;
const MARGIN = 2;
const HALF_WIDTH = 1;
const SIMPLIFY_EPSILON = 2;
const SPAN = 255;

type Strokes = ReadonlyArray<readonly Vec2[]>;

function extent(strokes: Strokes): { minX: number; minY: number; width: number; height: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    for (const p of s) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  return minX === Infinity ? null : { minX, minY, width: maxX - minX, height: maxY - minY };
}

/** Quick, Draw!'s simplified form: top-left aligned, longer side 0-255, simplified. */
export function prepareDoodle(strokes: Strokes): Vec2[][] {
  const box = extent(strokes);
  if (!box) return [];
  const side = Math.max(box.width, box.height);
  const scale = side > 0 ? SPAN / side : 1;
  return strokes
    .filter((s) => s.length > 0)
    .map((s) =>
      simplify(
        s.map((p) => ({ x: (p.x - box.minX) * scale, y: (p.y - box.minY) * scale })),
        SIMPLIFY_EPSILON,
      ),
    );
}

/** A DOODLE_SIZE² image in [0, 1], row by row, white strokes on black. */
export function rasterizeDoodle(strokes: Strokes): Float32Array {
  const image = new Float32Array(DOODLE_SIZE * DOODLE_SIZE);
  const box = extent(strokes);
  if (!box) return image;
  const side = Math.max(box.width, box.height);
  const inner = DOODLE_SIZE - 2 * MARGIN;
  const scale = side > 0 ? inner / side : 1;
  const offX = MARGIN + (inner - box.width * scale) / 2 - box.minX * scale;
  const offY = MARGIN + (inner - box.height * scale) / 2 - box.minY * scale;
  const segments: Array<[Vec2, Vec2]> = [];
  for (const s of strokes) {
    const mapped = s.map((p) => ({ x: p.x * scale + offX, y: p.y * scale + offY }));
    if (mapped.length === 1) segments.push([mapped[0]!, mapped[0]!]);
    for (let i = 1; i < mapped.length; i++) segments.push([mapped[i - 1]!, mapped[i]!]);
  }
  for (let row = 0; row < DOODLE_SIZE; row++) {
    for (let col = 0; col < DOODLE_SIZE; col++) {
      const center = { x: col + 0.5, y: row + 0.5 };
      let nearest = Infinity;
      for (const [a, b] of segments) nearest = Math.min(nearest, distanceToLine(center, a, b));
      image[row * DOODLE_SIZE + col] = Math.min(1, Math.max(0, HALF_WIDTH + 0.5 - nearest));
    }
  }
  return image;
}

/** prepareDoodle, then rasterizeDoodle: what the model sees for any drawing. */
export function doodleImage(strokes: Strokes): Float32Array {
  return rasterizeDoodle(prepareDoodle(strokes));
}
