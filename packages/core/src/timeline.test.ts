import { describe, expect, it } from 'vitest';
import { buildTimeline, sampleTimeline } from './timeline';
import type { Stroke } from './types';

function stroke(id: string, t0: number, t1: number): Stroke {
  return {
    id,
    brush: 'neon',
    color: '#FFB547',
    size: 10,
    createdAt: t0,
    points: [
      { x: 0, y: 0, depth: 1, t: t0 },
      { x: 10, y: 0, depth: 1, t: t1 },
    ],
  };
}

const opts = { speed: 2, maxGapMs: 300, leadInMs: 100, tailMs: 500 };

describe('timeline', () => {
  it('compresses long idle gaps and speeds up drawing', () => {
    const tl = buildTimeline([stroke('a', 1000, 2000), stroke('b', 12000, 13000)], opts);
    const [a, b] = tl.strokes;
    expect(a!.points.map((p) => p.t)).toEqual([100, 600]);
    expect(b!.points.map((p) => p.t)).toEqual([900, 1400]);
    expect(tl.duration).toBe(1900);
  });

  it('keeps simultaneous strokes simultaneous', () => {
    const tl = buildTimeline([stroke('a', 1000, 3000), stroke('b', 1500, 2500)], opts);
    expect(tl.strokes[1]!.points[0]!.t - tl.strokes[0]!.points[0]!.t).toBe(250);
  });

  it('prefixes ids so replay strokes never collide with real ones', () => {
    expect(buildTimeline([stroke('a', 0, 10)], opts).strokes[0]!.id).toBe('replay:a');
  });

  it('samples complete and partially drawn strokes at the playhead', () => {
    const tl = buildTimeline([stroke('a', 1000, 2000), stroke('b', 12000, 13000)], opts);
    const s = sampleTimeline(tl, 1000);
    expect(s.complete.map((x) => x.id)).toEqual(['replay:a']);
    expect(s.active[0]!.points).toHaveLength(1);
  });
});
