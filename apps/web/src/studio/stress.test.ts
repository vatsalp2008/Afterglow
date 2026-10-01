import { describe, expect, it } from 'vitest';
import { STRESS_STROKES, stressCount, stressStrokes } from './stress';

const frame = { width: 1333, height: 1000 };
const ids = () => {
  let n = 0;
  return () => `s${String(++n)}`;
};

describe('stressStrokes', () => {
  it('is deterministic and the size asked for', () => {
    const a = stressStrokes(frame, 10_000, ids(), 50);
    expect(a).toHaveLength(50);
    expect(stressStrokes(frame, 10_000, ids(), 50)).toEqual(a);
  });

  it('draws strokes one after another, ending now, with realistic lengths and timing', () => {
    const strokes = stressStrokes(frame, 10_000, ids(), 100);
    const lengths = strokes.map((s) => s.points.length);
    expect(Math.min(...lengths)).toBeGreaterThanOrEqual(20);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(200);
    const times = strokes.flatMap((s) => s.points.map((p) => p.t));
    expect(times.every((t, i) => i === 0 || t > times[i - 1]!)).toBe(true);
    expect(times[times.length - 1]).toBe(10_000);
    expect(new Set(strokes.map((s) => s.brush))).toEqual(new Set(['neon', 'sparks', 'ink']));
  });
});

describe('stressCount', () => {
  it('reads ?stress=N, with ?stress=1 meaning the default', () => {
    expect(stressCount('1000')).toBe(1000);
    expect(stressCount('1')).toBe(STRESS_STROKES);
    expect(stressCount('')).toBe(STRESS_STROKES);
    expect(stressCount('abc')).toBe(STRESS_STROKES);
  });
});
