import type { Stroke } from '@afterglow/core';
import { describe, expect, it } from 'vitest';
import { buildNib, DEFAULT_NIB_ANGLE, MIN_THICKNESS, smoothPath } from './nib';

/** A horizontal stroke from x = 0 to 40 at y = 0, size 10 (half-width 5), with the given nib angles. */
function stroke(angle: number | ((i: number) => number) | undefined, n = 5): Stroke {
  return {
    id: 's',
    brush: 'ribbon',
    color: '#5CE1E6',
    size: 10,
    createdAt: 0,
    points: Array.from({ length: n }, (_, i) => {
      const a = typeof angle === 'function' ? angle(i) : angle;
      return a === undefined ? { x: i * 10, y: 0, depth: 1, t: i } : { x: i * 10, y: 0, depth: 1, t: i, angle: a };
    }),
  };
}

/** Each strip vertex pair's offset from the centerline: [left − center] for every point. */
function offsets(geo: ReturnType<typeof buildNib>): Array<[number, number]> {
  const p = geo.getAttribute('position').array;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < p.length / 3; i += 2) {
    const lx = p[i * 3]!;
    const ly = p[i * 3 + 1]!;
    const rx = p[(i + 1) * 3]!;
    const ry = p[(i + 1) * 3 + 1]!;
    out.push([(lx - rx) / 2, (ly - ry) / 2]);
  }
  return out;
}

describe('buildNib', () => {
  it('draws full width moving across the nib', () => {
    for (const [x, y] of offsets(buildNib(stroke(Math.PI / 2)))) {
      expect(Math.abs(y)).toBeCloseTo(5, 5);
      expect(x).toBeCloseTo(0, 5);
    }
  });

  it('draws thin, but never thinner than the minimum, moving along the nib', () => {
    for (const [, y] of offsets(buildNib(stroke(0)))) expect(Math.abs(y)).toBeCloseTo(5 * MIN_THICKNESS, 5);
  });

  it('never exceeds the half-width, and treats a nib and its reverse alike', () => {
    const a = offsets(buildNib(stroke(Math.PI / 3)));
    const b = offsets(buildNib(stroke(Math.PI / 3 + Math.PI)));
    a.forEach(([x, y], i) => {
      // Positions are 32-bit floats.
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(5 + 1e-5);
      expect(Math.abs(y)).toBeCloseTo(Math.abs(b[i]![1]), 5);
    });
  });

  it('uses an italic slant without a hand', () => {
    // At 45° to a horizontal path, the nib shows sin 45° of its width.
    const [, y] = offsets(buildNib(stroke(undefined)))[2]!;
    expect(Math.abs(y)).toBeCloseTo(5 * Math.abs(Math.sin(DEFAULT_NIB_ANGLE)), 5);
  });

  it('narrows to its edge where the hand turns the nib through the path, as a twist', () => {
    // From 45° above the path to 45° below it, passing along it in the middle.
    const widths = offsets(buildNib(stroke((i) => ((45 - i * 22.5) * Math.PI) / 180))).map(([, y]) => Math.abs(y));
    expect(widths[Math.floor(widths.length / 2)]!).toBeCloseTo(5 * MIN_THICKNESS, 5);
    expect(widths[0]!).toBeGreaterThan(3);
    expect(widths[widths.length - 1]!).toBeGreaterThan(3);
  });

  it('draws a single point as one nib-shaped quad, and nothing for no points', () => {
    const geo = buildNib(stroke(0, 1));
    expect(geo.getAttribute('position').count).toBe(4);
    expect(geo.getIndex()?.count).toBe(6);
    expect(buildNib({ ...stroke(0), points: [] }).getAttribute('position')).toBeUndefined();
  });
});

describe('smoothPath', () => {
  it('evens out small wiggles and keeps straight lines and the other fields', () => {
    const zigzag = Array.from({ length: 9 }, (_, i) => ({ x: i * 2.5, y: i % 2 ? 1 : -1, depth: 1, t: i, angle: 0.4 }));
    const out = smoothPath(zigzag);
    expect(Math.max(...out.slice(2, -2).map((p) => Math.abs(p.y)))).toBeLessThan(0.25);
    expect(out.every((p, i) => p.t === i && p.angle === 0.4)).toBe(true);
    const straight = Array.from({ length: 6 }, (_, i) => ({ x: i, y: 2 * i, depth: 1, t: i }));
    for (const p of smoothPath(straight).slice(2, -2)) expect(p.y).toBeCloseTo(2 * p.x, 9);
  });
});
