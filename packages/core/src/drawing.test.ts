import { describe, expect, it } from 'vitest';
import { DRAWING_LIMITS, parseDrawing, placeDrawing, toDrawing, type Drawing } from './drawing.ts';
import type { Stroke } from './types.ts';

const frame = { width: 1333.333333, height: 1000 };

function stroke(id: string, points: Array<[number, number, number]>, extra: Partial<Stroke> = {}): Stroke {
  return {
    id,
    brush: 'ribbon',
    color: '#5CE1E6',
    size: 11,
    createdAt: points[0]?.[2] ?? 0,
    points: points.map(([x, y, t]) => ({ x, y, depth: 1.23456, t, angle: 0.123456789 })),
    ...extra,
  };
}

const saved = (d: unknown) => JSON.stringify(d);
const sample = () =>
  toDrawing(
    [
      stroke('a', [
        [10.123456, 20, 1000.04],
        [30, 40, 1016.6],
      ]),
      stroke('b', [[5, 5, 2000]]),
    ],
    frame,
  );

describe('drawing files', () => {
  it('round-trip, rounded below what anyone can see', () => {
    const parsed = parseDrawing(saved(sample()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.drawing).toEqual(sample());
    const p = parsed.drawing.strokes[0]!.points[0]!;
    expect(p).toEqual({ x: 10.12, y: 20, depth: 1.235, t: 1000, angle: 0.1235 });
    expect(parsed.drawing.frame).toEqual({ width: 1333.33, height: 1000 });
  });

  it('copy only the fields they know', () => {
    const d = sample() as unknown as { strokes: Array<Record<string, unknown>> } & Record<string, unknown>;
    d['extra'] = 1;
    d.strokes[0]!['onclick'] = 'x';
    const parsed = parseDrawing(saved(d));
    expect(parsed.ok && Object.keys(parsed.drawing.strokes[0]!).sort()).toEqual([
      'brush',
      'color',
      'createdAt',
      'id',
      'points',
      'size',
    ]);
  });

  it.each([
    ['not JSON', 'hello', 'notDrawing'],
    ['another JSON file', '{"version":1,"frames":[]}', 'notDrawing'],
    ['a list', '[]', 'notDrawing'],
    ['a newer version', saved({ ...sample(), version: 2 }), 'newerVersion'],
    ['a broken version', saved({ ...sample(), version: '1' }), 'damaged'],
    ['no frame', saved({ ...sample(), frame: null }), 'damaged'],
    ['an empty frame', saved({ ...sample(), frame: { width: 0, height: 10 } }), 'damaged'],
  ])('reject %s', (_, text, problem) => {
    expect(parseDrawing(text)).toEqual({ ok: false, problem });
  });

  it.each<[string, (s: Record<string, unknown>) => void]>([
    ['an unknown brush', (s) => (s['brush'] = 'laser')],
    ['a color that isn’t hex', (s) => (s['color'] = 'red')],
    ['a size out of range', (s) => (s['size'] = 1000)],
    ['a missing time', (s) => delete s['createdAt']],
    ['a point that isn’t a number', (s) => ((s['points'] as Array<Record<string, unknown>>)[0]!['x'] = '1')],
    ['a point far off the canvas', (s) => ((s['points'] as Array<Record<string, unknown>>)[0]!['y'] = 1e9)],
    ['a depth of zero', (s) => ((s['points'] as Array<Record<string, unknown>>)[0]!['depth'] = 0)],
    ['a broken angle', (s) => ((s['points'] as Array<Record<string, unknown>>)[0]!['angle'] = null)],
  ])('reject a stroke with %s', (_, damage) => {
    const d = JSON.parse(saved(sample())) as { strokes: Array<Record<string, unknown>> };
    damage(d.strokes[0]!);
    expect(parseDrawing(saved(d))).toEqual({ ok: false, problem: 'damaged' });
  });

  it('reject files beyond the limits', () => {
    const many = {
      ...sample(),
      strokes: Array.from({ length: DRAWING_LIMITS.strokes + 1 }, () => sample().strokes[1]),
    };
    expect(parseDrawing(saved(many))).toEqual({ ok: false, problem: 'tooLarge' });
    const long = stroke(
      'l',
      Array.from({ length: DRAWING_LIMITS.pointsPerStroke + 1 }, (_, i) => [i % 100, 0, i]),
    );
    expect(parseDrawing(saved(toDrawing([long], frame)))).toEqual({ ok: false, problem: 'tooLarge' });
  });
});

describe('placeDrawing', () => {
  const drawing: Drawing = {
    format: 'afterglow.drawing',
    version: 1,
    frame: { width: 1000, height: 1000 },
    strokes: [
      stroke('a', [
        [0, 0, 500],
        [1000, 1000, 900],
      ]),
      stroke('empty', []),
      stroke('b', [[500, 500, 1000]], { createdAt: 950 }),
    ],
  };
  let n = 0;
  const placed = placeDrawing(drawing, { width: 2000, height: 1000 }, 60_000, () => `new${String(n++)}`);

  it('fits and centers the drawing in the frame', () => {
    expect(placed[0]!.points.map((p) => [p.x, p.y])).toEqual([
      [500, 0],
      [1500, 1000],
    ]);
    expect(placed[1]!.points[0]).toMatchObject({ x: 1000, y: 500 });
  });

  it('scales stroke sizes with it', () => {
    const small = placeDrawing(drawing, { width: 500, height: 800 }, 0, () => 'x');
    expect(small[0]!.size).toBeCloseTo(5.5);
    expect(small[0]!.points[1]).toMatchObject({ x: 500, y: 650 });
  });

  it('moves it in time so its newest point is now, keeping its pacing', () => {
    expect(placed[0]!.points.map((p) => p.t)).toEqual([59_500, 59_900]);
    expect(placed[1]!.points[0]!.t).toBe(60_000);
    expect(placed[1]!.createdAt).toBe(59_950);
  });

  it('gives strokes new ids and drops empty ones', () => {
    expect(placed.map((s) => s.id)).toEqual(['new0', 'new1']);
  });

  it('keeps nib angles', () => {
    expect(placed[0]!.points[0]!.angle).toBe(0.123456789);
  });
});
