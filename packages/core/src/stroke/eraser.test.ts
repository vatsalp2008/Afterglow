import { describe, expect, it } from 'vitest';
import type { Stroke } from '../types.ts';
import { eraseStrokes } from './eraser.ts';

// A straight horizontal stroke from x = 0 to 100 at y = 0, sampled every 10 units.
const line = (id = 'a', y = 0, size = 4): Stroke => ({
  id,
  brush: 'neon',
  color: '#FFB547',
  size,
  createdAt: 5,
  points: Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y, depth: 1, t: i * 10 })),
});

const ids = () => {
  let n = 0;
  return () => `p${String(++n)}`;
};

const span = (s: Stroke) => [s.points[0]!.x, s.points[s.points.length - 1]!.x];

describe('eraseStrokes', () => {
  it('splits a stroke erased through the middle into two pieces', () => {
    const { removed, added } = eraseStrokes(
      [line()],
      [
        { x: 50, y: -30 },
        { x: 50, y: 30 },
      ],
      5,
      ids(),
    );
    expect(removed.map((s) => s.id)).toEqual(['a']);
    expect(added).toHaveLength(2);
    // The eraser reaches 5 units plus half the 4-unit width: everything within 7 of x = 50 goes.
    const [left, right] = added.map(span);
    expect(left![0]).toBe(0);
    expect(left![1]).toBeLessThan(43);
    expect(left![1]).toBeGreaterThan(40);
    expect(right![0]).toBeGreaterThan(57);
    expect(right![0]).toBeLessThan(60);
    expect(right![1]).toBe(100);
  });

  it('gives the pieces new ids and keeps the stroke’s style and timing', () => {
    const { added } = eraseStrokes([line()], [{ x: 50, y: 0 }], 5, ids());
    expect(added.map((s) => s.id)).toEqual(['p1', 'p2']);
    for (const piece of added) {
      expect(piece).toMatchObject({ brush: 'neon', color: '#FFB547', size: 4, createdAt: 5 });
      // Times are interpolated along the stroke, so a replay draws the pieces where they were.
      expect(piece.points.every((p) => Math.abs(p.t - p.x) < 1e-9)).toBe(true);
    }
  });

  it('trims an end without leaving a second piece', () => {
    const { added } = eraseStrokes([line()], [{ x: 100, y: 0 }], 20, ids());
    expect(added).toHaveLength(1);
    expect(span(added[0]!)[1]).toBeLessThan(78);
  });

  it('removes a stroke erased completely, and a dot', () => {
    const dot: Stroke = { ...line('d'), points: [{ x: 300, y: 300, depth: 1, t: 0 }] };
    const path = [
      { x: -20, y: 0 },
      { x: 120, y: 0 },
    ];
    const { removed, added } = eraseStrokes([line(), dot], [...path, { x: 300, y: 300 }], 10, ids());
    expect(removed.map((s) => s.id)).toEqual(['a', 'd']);
    expect(added).toEqual([]);
  });

  it('leaves strokes the eraser misses untouched', () => {
    const far = line('far', 200);
    const { removed, added } = eraseStrokes([line(), far], [{ x: 50, y: 0 }], 5, ids());
    expect(removed.map((s) => s.id)).toEqual(['a']);
    expect(added.every((s) => s.points.every((p) => p.y === 0))).toBe(true);
    expect(eraseStrokes([far], [{ x: 50, y: 150 }], 10, ids())).toEqual({ removed: [], added: [] });
    expect(eraseStrokes([far], [], 10, ids())).toEqual({ removed: [], added: [] });
  });

  it('catches a stroke between its samples', () => {
    // Two points far apart: the eraser crosses the segment between them, far from both.
    const long: Stroke = {
      ...line(),
      points: [
        { x: 0, y: 0, depth: 1, t: 0 },
        { x: 400, y: 0, depth: 1, t: 400 },
      ],
    };
    const { added } = eraseStrokes([long], [{ x: 200, y: 0 }], 4, ids());
    expect(added).toHaveLength(2);
  });

  it('reaches further into thicker, closer strokes', () => {
    const thick = { ...line('t', 0, 20) };
    // 5 units of eraser plus 10 of half-width: a point 14 units off the line still erases it.
    expect(eraseStrokes([thick], [{ x: 50, y: 14 }], 5, ids()).removed).toHaveLength(1);
    expect(eraseStrokes([line()], [{ x: 50, y: 14 }], 5, ids()).removed).toHaveLength(0);
  });
});
