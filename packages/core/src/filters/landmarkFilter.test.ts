import { describe, expect, it } from 'vitest';
import type { HandFrame } from '../types.ts';
import { LandmarkFilter } from './landmarkFilter.ts';
import { DEFAULT_FILTER_SPECS } from './spec.ts';

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
    const lf = new LandmarkFilter(DEFAULT_FILTER_SPECS.oneEuro);
    expect(x(lf.apply(frame(0, { Right: 0.5 })), 'Right')).toBe(0.5);
    const next = x(lf.apply(frame(33, { Right: 0.6 })), 'Right')!;
    expect(next).toBeGreaterThan(0.5);
    expect(next).toBeLessThan(0.6);
  });

  it('keeps separate state per hand key', () => {
    const lf = new LandmarkFilter(DEFAULT_FILTER_SPECS.oneEuro);
    lf.apply(frame(0, { Left: 0.2, Right: 0.8 }));
    const f = lf.apply(frame(33, { Left: 0.2, Right: 0.8 }));
    expect(x(f, 'Left')).toBeCloseTo(0.2, 9);
    expect(x(f, 'Right')).toBeCloseTo(0.8, 9);
  });

  it('starts fresh when a hand comes back after being lost', () => {
    const lf = new LandmarkFilter(DEFAULT_FILTER_SPECS.oneEuro);
    lf.apply(frame(0, { Right: 0.1 }));
    lf.apply(frame(33, {}));
    expect(x(lf.apply(frame(66, { Right: 0.9 })), 'Right')).toBe(0.9);
  });

  it('restarts from the next frame with a new spec', () => {
    const lf = new LandmarkFilter(DEFAULT_FILTER_SPECS.oneEuro);
    lf.apply(frame(0, { Right: 0 }));
    lf.setSpec({ kind: 'ema', tauMs: 50 });
    expect(lf.currentSpec.kind).toBe('ema');
    // Fresh state: the first sample after the switch passes through.
    expect(x(lf.apply(frame(33, { Right: 1 })), 'Right')).toBe(1);
    expect(x(lf.apply(frame(66, { Right: 0 })), 'Right')).toBeCloseTo(Math.exp(-33 / 50), 9);
  });

  it('passes landmarks through unchanged with no filter', () => {
    const lf = new LandmarkFilter(DEFAULT_FILTER_SPECS.none);
    lf.apply(frame(0, { Right: 0.1 }));
    expect(x(lf.apply(frame(33, { Right: 0.9 })), 'Right')).toBe(0.9);
  });
});
