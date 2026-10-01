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

describe('densify with nib angles', () => {
  it('interpolates the angle the short way round, and keeps points without one plain', () => {
    const pts = densify(
      [
        { x: 0, y: 0, depth: 1, t: 0, angle: (170 * Math.PI) / 180 },
        { x: 100, y: 0, depth: 1, t: 100, angle: (-170 * Math.PI) / 180 },
      ],
      10,
    );
    const mid = pts[Math.floor(pts.length / 2)]!;
    // Halfway from 170° to 190° (−170°) is 180°, not 0°.
    expect(Math.abs(Math.cos(mid.angle!))).toBeCloseTo(1, 3);
    expect(Math.cos(mid.angle!)).toBeLessThan(0);
    expect(
      densify(
        [
          { x: 0, y: 0, depth: 1, t: 0 },
          { x: 50, y: 0, depth: 1, t: 50 },
        ],
        10,
      )[2],
    ).not.toHaveProperty('angle');
  });
});
