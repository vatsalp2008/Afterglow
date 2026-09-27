import { describe, expect, it } from 'vitest';
import type { HandFrame } from '../types';
import { LandmarkFilter } from './landmarkFilter';
import { DEFAULT_ONE_EURO } from './oneEuro';

function frame(t: number, hands: Record<string, number>): HandFrame {
  return {
    frameId: t,
    captureTime: t,
    hands: Object.entries(hands).map(([key, x]) => ({
      key,
      handedness: 'Right' as const,
      score: 1,
      landmarks: [{ x, y: x, z: 0 }],
    })),
  };
}

const x = (f: HandFrame, key: string) => f.hands.find((h) => h.key === key)?.landmarks[0]?.x;

describe('LandmarkFilter', () => {
  it('passes the first sample of a hand through and smooths later jumps', () => {
    const lf = new LandmarkFilter(DEFAULT_ONE_EURO);
    expect(x(lf.apply(frame(0, { Right: 0.5 })), 'Right')).toBe(0.5);
    const next = x(lf.apply(frame(33, { Right: 0.6 })), 'Right')!;
    expect(next).toBeGreaterThan(0.5);
    expect(next).toBeLessThan(0.6);
  });

  it('keeps separate state per hand key', () => {
    const lf = new LandmarkFilter(DEFAULT_ONE_EURO);
    lf.apply(frame(0, { Left: 0.2, Right: 0.8 }));
    const f = lf.apply(frame(33, { Left: 0.2, Right: 0.8 }));
    expect(x(f, 'Left')).toBeCloseTo(0.2, 9);
    expect(x(f, 'Right')).toBeCloseTo(0.8, 9);
  });

  it('starts fresh when a hand comes back after being lost', () => {
    const lf = new LandmarkFilter(DEFAULT_ONE_EURO);
    lf.apply(frame(0, { Right: 0.1 }));
    lf.apply(frame(33, {}));
    expect(x(lf.apply(frame(66, { Right: 0.9 })), 'Right')).toBe(0.9);
  });

  it('applies new parameters to existing filters', () => {
    const lf = new LandmarkFilter(DEFAULT_ONE_EURO);
    lf.apply(frame(0, { Right: 0 }));
    lf.setParams({ minCutoff: 1000, beta: 0, dCutoff: 1 });
    expect(x(lf.apply(frame(33, { Right: 1 })), 'Right')).toBeGreaterThan(0.99);
  });
});
