import { describe, expect, it } from 'vitest';
import type { Stroke } from '../types.ts';
import { fromViewBox, refineBox, refinedStrokes, toViewBox } from './refine.ts';

const stroke = (points: Array<[number, number]>): Stroke => ({
  id: 's',
  brush: 'neon',
  color: '#FFB547',
  size: 11,
  createdAt: 0,
  points: points.map(([x, y], i) => ({ x, y, depth: 1, t: i })),
});

const style = { brush: 'ribbon' as const, color: '#5CE1E6', size: 6 };

describe('refineBox', () => {
  it('is a square around the strokes with a margin', () => {
    const box = refineBox([
      stroke([
        [100, 200],
        [600, 300],
      ]),
    ])!;
    expect(box.size).toBeCloseTo(500 * 1.16);
    // Centered on the drawing.
    expect(box.x + box.size / 2).toBeCloseTo(350);
    expect(box.y + box.size / 2).toBeCloseTo(250);
  });

  it('is never tiny, and is null without strokes', () => {
    expect(
      refineBox([
        stroke([
          [10, 10],
          [12, 12],
        ]),
      ])!.size,
    ).toBe(200);
    expect(refineBox([])).toBeNull();
  });

  it('maps to and from the model’s viewBox', () => {
    const box = { x: 100, y: 50, size: 500 };
    expect(toViewBox({ x: 350, y: 300 }, box)).toEqual({ x: 500, y: 500 });
    expect(fromViewBox({ x: 0, y: 1000 }, box)).toEqual({ x: 100, y: 550 });
  });
});

describe('refinedStrokes', () => {
  const box = { x: 0, y: 0, size: 1000 };
  let n = 0;
  const id = () => `r${String(n++)}`;

  it('makes a stroke per subpath, in the current style, sampled densely', () => {
    const strokes = refinedStrokes(['M100 100 H300', 'M0 0 L10 0 M500 500 V600'], box, style, 1000, id)!;
    expect(strokes).toHaveLength(3);
    expect(strokes[0]).toMatchObject({ brush: 'ribbon', color: '#5CE1E6', size: 6 });
    expect(strokes[0]!.points.length).toBeGreaterThanOrEqual(80);
    expect(strokes.every((s) => s.points.every((p) => p.depth === 1))).toBe(true);
  });

  it('times strokes to draw in one after another', () => {
    const strokes = refinedStrokes(['M0 0 H120', 'M0 100 H120'], box, style, 1000, id)!;
    const [a, b] = strokes;
    expect(a!.points[0]!.t).toBe(1000);
    expect(a!.points[a!.points.length - 1]!.t).toBeCloseTo(1100);
    expect(b!.points[0]!.t).toBeCloseTo(1190);
  });

  it('draws long art faster, within the time limit', () => {
    const paths = Array.from({ length: 20 }, (_, i) => `M0 ${String(i * 40)} H1000`);
    const strokes = refinedStrokes(paths, box, style, 0, id)!;
    const last = strokes[strokes.length - 1]!;
    expect(last.points[last.points.length - 1]!.t).toBeLessThanOrEqual(4000 + 1e-6);
  });

  it('places paths in the drawing’s box, and refuses invalid ones', () => {
    const [s] = refinedStrokes(['M0 0 L1000 1000'], { x: 200, y: 100, size: 400 }, style, 0, id)!;
    expect(s!.points[0]).toMatchObject({ x: 200, y: 100 });
    expect(s!.points[s!.points.length - 1]).toMatchObject({ x: 600, y: 500 });
    expect(refinedStrokes(['M0 0 L100 100', 'nonsense'], box, style, 0, id)).toBeNull();
  });
});
