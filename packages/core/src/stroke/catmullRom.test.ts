import { describe, expect, it } from 'vitest';
import type { StrokePoint } from '../types.ts';
import { densify } from './catmullRom.ts';

const pt = (x: number, y: number, t: number): StrokePoint => ({ x, y, depth: 1, t });

describe('densify', () => {
  it('passes through every control point', () => {
    const src = [pt(0, 0, 0), pt(40, 10, 33), pt(80, -20, 66), pt(90, 60, 99)];
    const out = densify(src, 3);
    for (const p of src) expect(out.some((q) => q.x === p.x && q.y === p.y)).toBe(true);
  });

  it('keeps straight input straight and roughly evenly spaced', () => {
    const out = densify([pt(0, 0, 0), pt(30, 0, 10), pt(100, 0, 20)], 2);
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!.y).toBeCloseTo(0, 9);
      expect(out[i]!.x - out[i - 1]!.x).toBeLessThanOrEqual(2 * 1.25);
    }
  });

  it('interpolates time monotonically', () => {
    const out = densify([pt(0, 0, 0), pt(50, 50, 100), pt(0, 100, 200)], 4);
    for (let i = 1; i < out.length; i++) expect(out[i]!.t).toBeGreaterThanOrEqual(out[i - 1]!.t);
  });
});
