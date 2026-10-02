import { describe, expect, it } from 'vitest';
import type { ShapeKind, Stroke, Vec2 } from '../../types.ts';
import { distance, pathLength } from './path.ts';
import { recognizeShape, snapStroke } from './snap.ts';

/** A small seeded generator, so the synthetic strokes are the same every run. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * A hand-drawn version of a polyline: resampled unevenly (3 to 9 units apart), with a
 * slow wobble across the path and a little jitter, as a hand in the air draws.
 */
function handDrawn(path: readonly Vec2[], rand: () => number, wobble: number): Vec2[] {
  const total = pathLength(path);
  const out: Vec2[] = [];
  const phase = rand() * 10;
  const freq = 2 + rand() * 2;
  let along = 0;
  let seg = 0;
  let segStart = 0;
  while (along <= total) {
    while (seg < path.length - 2 && segStart + distance(path[seg]!, path[seg + 1]!) < along) {
      segStart += distance(path[seg]!, path[seg + 1]!);
      seg++;
    }
    const a = path[seg]!;
    const b = path[seg + 1]!;
    const len = distance(a, b) || 1;
    const u = Math.min(1, (along - segStart) / len);
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const off = wobble * Math.sin(phase + (freq * 2 * Math.PI * along) / total) + (rand() - 0.5) * wobble * 0.4;
    out.push({ x: a.x + (b.x - a.x) * u + nx * off, y: a.y + (b.y - a.y) * u + ny * off });
    along += 3 + rand() * 6;
  }
  return out;
}

function transform(path: readonly Vec2[], angle: number, scale: number, at: Vec2): Vec2[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return path.map((p) => ({ x: at.x + scale * (p.x * cos - p.y * sin), y: at.y + scale * (p.x * sin + p.y * cos) }));
}

function ellipse(rx: number, ry: number, start: number, turns: number, reverse: boolean): Vec2[] {
  const n = 120;
  return Array.from({ length: n + 1 }, (_, k) => {
    const a = start + ((reverse ? -1 : 1) * turns * 2 * Math.PI * k) / n;
    return { x: rx * Math.cos(a), y: ry * Math.sin(a) };
  });
}

/** A closed polygon from vertex `start`, overshooting past its start by `overshoot` of the first side. */
function polygon(corners: readonly Vec2[], start: number, reverse: boolean, overshoot: number): Vec2[] {
  const n = corners.length;
  const order = Array.from({ length: n + 1 }, (_, k) => corners[(start + (reverse ? n - k : k)) % n]!);
  const a = order[0]!;
  const b = order[1]!;
  return [...order, { x: a.x + (b.x - a.x) * overshoot, y: a.y + (b.y - a.y) * overshoot }];
}

const rect = (w: number, h: number) => [
  { x: -w / 2, y: -h / 2 },
  { x: w / 2, y: -h / 2 },
  { x: w / 2, y: h / 2 },
  { x: -w / 2, y: h / 2 },
];

/** Runs `make` many times with random placements; returns how often each shape came back. */
function tally(make: (rand: () => number) => Vec2[], runs = 40, seed = 1): Record<string, number> {
  const rand = prng(seed);
  const counts: Record<string, number> = {};
  for (let i = 0; i < runs; i++) {
    const match = recognizeShape(make(rand));
    const key = match?.shape ?? 'none';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

const placed = (rand: () => number, path: Vec2[], wobble: number) =>
  handDrawn(transform(path, rand() * 2 * Math.PI, 0.8 + rand() * 1.6, { x: 600, y: 500 }), rand, wobble);

const share = (counts: Record<string, number>, shape: ShapeKind | 'none', runs = 40) => (counts[shape] ?? 0) / runs;

describe('recognizeShape', () => {
  it('snaps straight strokes to lines', () => {
    const counts = tally((rand) =>
      placed(
        rand,
        [
          { x: -120, y: 0 },
          { x: 120, y: 0 },
        ],
        3,
      ),
    );
    expect(share(counts, 'line')).toBeGreaterThanOrEqual(0.95);
  });

  it('snaps round loops to circles, in either direction, with or without an overshoot', () => {
    const counts = tally((rand) => placed(rand, ellipse(110, 110, rand() * 6.28, 1 + rand() * 0.15, rand() > 0.5), 5));
    expect(share(counts, 'circle')).toBeGreaterThanOrEqual(0.9);
  });

  it('tells ellipses from circles', () => {
    const counts = tally((rand) => placed(rand, ellipse(140, 70, rand() * 6.28, 1.05, rand() > 0.5), 4));
    expect(share(counts, 'ellipse')).toBeGreaterThanOrEqual(0.85);
  });

  it('snaps rectangles, whatever corner they start at', () => {
    const counts = tally((rand) =>
      placed(rand, polygon(rect(200, 120 + rand() * 80), Math.floor(rand() * 4), rand() > 0.5, 0.1), 4),
    );
    expect(share(counts, 'rectangle')).toBeGreaterThanOrEqual(0.85);
  });

  it('snaps triangles', () => {
    const tri = [
      { x: 0, y: -110 },
      { x: 110, y: 80 },
      { x: -110, y: 80 },
    ];
    const counts = tally((rand) => placed(rand, polygon(tri, Math.floor(rand() * 3), rand() > 0.5, 0.08), 4));
    expect(share(counts, 'triangle')).toBeGreaterThanOrEqual(0.85);
  });

  it('snaps one-stroke arrows into a shaft and two barbs', () => {
    const counts = tally((rand) => {
      const flip = rand() > 0.5 ? 1 : -1;
      const arrow = [
        { x: -150, y: 0 },
        { x: 150, y: 0 },
        { x: 100, y: -45 * flip },
        { x: 150, y: 0 },
        { x: 100, y: 45 * flip },
      ];
      return placed(rand, arrow, 2.5);
    });
    expect(share(counts, 'arrow')).toBeGreaterThanOrEqual(0.8);
  });

  it('leaves loose strokes alone', () => {
    const wave = Array.from({ length: 80 }, (_, i) => ({ x: i * 5 - 200, y: 40 * Math.sin(i / 6) }));
    const spiral = Array.from({ length: 120 }, (_, i) => ({
      x: (20 + i * 1.4) * Math.cos(i / 8),
      y: (20 + i * 1.4) * Math.sin(i / 8),
    }));
    const zigzag = [
      { x: -150, y: 0 },
      { x: -75, y: -80 },
      { x: 0, y: 0 },
      { x: 75, y: -80 },
      { x: 150, y: 0 },
    ];
    const letterS = ellipse(60, 40, Math.PI / 2, 0.75, false)
      .map((p) => ({ x: p.x, y: p.y - 40 }))
      .concat(ellipse(60, 40, -Math.PI / 2, 0.75, true).map((p) => ({ x: p.x, y: p.y + 40 })));
    const u = Array.from({ length: 60 }, (_, i) => ({
      x: 100 * Math.cos(Math.PI * (i / 59)),
      y: 120 * Math.sin(Math.PI * (i / 59)),
    }));
    const eight = Array.from({ length: 160 }, (_, i) => {
      const t = (2 * Math.PI * i) / 159;
      return { x: 100 * Math.sin(t), y: 100 * Math.sin(t) * Math.cos(t) };
    });
    const heart = Array.from({ length: 120 }, (_, i) => {
      const t = (2 * Math.PI * i) / 119;
      return {
        x: 7 * 16 * Math.sin(t) ** 3,
        y: -7 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
      };
    });
    const star = Array.from({ length: 11 }, (_, i) => {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
      return { x: 120 * Math.cos(a), y: 120 * Math.sin(a) };
    });
    const blob = Array.from({ length: 121 }, (_, i) => {
      const t = (2 * Math.PI * i) / 120;
      const r = 110 + 35 * Math.sin(3 * t) + 20 * Math.cos(5 * t);
      return { x: r * Math.cos(t), y: r * Math.sin(t) };
    });
    for (const [name, path] of Object.entries({ wave, spiral, zigzag, letterS, u, eight, heart, star, blob })) {
      const counts = tally((rand) => placed(rand, path, 3), 20, 7);
      expect({ name, none: counts['none'] ?? 0 }).toEqual({ name, none: 20 });
    }
  });

  it('ignores tiny strokes and dots', () => {
    expect(recognizeShape(ellipse(5, 5, 0, 1, false))).toBeNull();
    expect(recognizeShape([{ x: 1, y: 1 }])).toBeNull();
    expect(recognizeShape([])).toBeNull();
  });

  it('fits the shape that was drawn', () => {
    const rand = prng(3);
    const circle = recognizeShape(
      handDrawn(transform(ellipse(150, 150, 0, 1.05, false), 0, 1, { x: 500, y: 400 }), rand, 5),
    );
    expect(circle?.shape).toBe('circle');
    const path = circle!.paths[0]!;
    for (const p of path) expect(Math.abs(distance(p, { x: 500, y: 400 }) - 150)).toBeLessThan(12);

    const line = recognizeShape(
      handDrawn(
        [
          { x: 100, y: 100 },
          { x: 400, y: 300 },
        ],
        rand,
        2,
      ),
    );
    const [a, b] = line!.paths[0]!;
    expect(distance(a!, { x: 100, y: 100 })).toBeLessThan(10);
    expect(distance(b!, { x: 400, y: 300 })).toBeLessThan(10);
  });
});

describe('snapStroke', () => {
  const rand = prng(11);
  const raw = handDrawn(transform(polygon(rect(220, 140), 0, false, 0.1), 0.2, 1, { x: 500, y: 500 }), rand, 3);
  const stroke: Stroke = {
    id: 'raw',
    brush: 'ribbon',
    color: '#5CE1E6',
    size: 11,
    createdAt: 1000,
    points: raw.map((p, i) => ({ ...p, depth: i % 2 ? 1.2 : 0.8, t: 1000 + i * 16, angle: 0.3 })),
  };
  let n = 0;
  const result = snapStroke(stroke, () => `snap${String(n++)}`);

  it('replaces the stroke with an evenly spaced clean shape in the same style', () => {
    expect(result?.shape).toBe('rectangle');
    const [clean] = result!.strokes;
    expect(clean).toMatchObject({ id: 'snap0', brush: 'ribbon', color: '#5CE1E6', size: 11, shape: 'rectangle' });
    const gaps = clean!.points.slice(1).map((p, i) => distance(p, clean!.points[i]!));
    expect(Math.max(...gaps)).toBeLessThan(3.5);
    const depth = clean!.points[0]!.depth;
    expect(depth).toBeCloseTo(1, 1);
    expect(clean!.points.every((p) => p.depth === depth && p.angle === 0.3)).toBe(true);
  });

  it('starts where the hand did and keeps its timing', () => {
    const [clean] = result!.strokes;
    const pts = clean!.points;
    expect(distance(pts[0]!, raw[0]!)).toBeLessThan(25);
    expect(pts[0]!.t).toBe(1000);
    expect(pts[pts.length - 1]!.t).toBeCloseTo(stroke.points[stroke.points.length - 1]!.t);
    expect(pts.every((p, i) => i === 0 || p.t >= pts[i - 1]!.t)).toBe(true);
  });

  it('keeps a stroke that isn’t a shape', () => {
    const wave: Stroke = {
      ...stroke,
      points: Array.from({ length: 80 }, (_, i) => ({ x: i * 5, y: 40 * Math.sin(i / 6), depth: 1, t: i })),
    };
    expect(snapStroke(wave, () => 'x')).toBeNull();
  });
});
