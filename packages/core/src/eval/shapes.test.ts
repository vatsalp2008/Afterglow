import { describe, expect, it } from 'vitest';
import type { Stroke, Vec2 } from '../types.ts';
import { scoreShapes } from './shapes.ts';

const stroke = (points: Vec2[]): Stroke => ({
  id: 's',
  brush: 'neon',
  color: '#FFB547',
  size: 11,
  createdAt: 0,
  points: points.map((p, i) => ({ ...p, depth: 1, t: i * 16 })),
});

const line = stroke(Array.from({ length: 30 }, (_, i) => ({ x: 100 + i * 10, y: 200 })));
const circle = stroke(
  Array.from({ length: 80 }, (_, i) => ({
    x: 500 + 120 * Math.cos((i / 79) * 2 * Math.PI * 1.05),
    y: 400 + 120 * Math.sin((i / 79) * 2 * Math.PI * 1.05),
  })),
);
const wave = stroke(Array.from({ length: 80 }, (_, i) => ({ x: i * 5, y: 40 * Math.sin(i / 6) })));

describe('scoreShapes', () => {
  it('counts right snaps, wrong snaps, and loose strokes left alone', () => {
    const score = scoreShapes([
      { label: 'line', strokes: [line] },
      { label: 'circle', strokes: [circle] },
      // Labeled a rectangle, but a circle was drawn: snapping is right to make it a circle.
      { label: 'rectangle', strokes: [circle] },
      { label: 'loose', strokes: [wave] },
      { label: 'loose', strokes: [line] },
    ]);
    expect(score.confusion).toEqual({
      line: { line: 1 },
      circle: { circle: 1 },
      rectangle: { circle: 1 },
      loose: { none: 1, line: 1 },
    });
    expect(score.accuracy).toBeCloseTo(2 / 3);
    expect(score.falseSnaps).toBe(0.5);
    expect(score.recall).toEqual({ line: 1, circle: 1, rectangle: 0 });
    expect(score.precision).toEqual({ line: 0.5, circle: 0.5 });
  });

  it('judges a prompt drawn in several strokes by its longest', () => {
    const score = scoreShapes([{ label: 'circle', strokes: [line, circle] }]);
    expect(score.multiStroke).toBe(1);
    expect(score.accuracy).toBe(1);
  });
});
