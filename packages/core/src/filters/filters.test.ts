import { describe, expect, it } from 'vitest';
import { EmaFilter } from './ema.ts';
import { PassThroughFilter, type Filter } from './filter.ts';
import { KalmanFilter } from './kalman.ts';
import { OneEuroFilter } from './oneEuro.ts';
import { createFilter, DEFAULT_FILTER_SPECS, type FilterKind } from './spec.ts';

const DT = 1000 / 30;

function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function std(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
}

/** Feeds `signal(t)` at 30 Hz for `ms` and returns [t, input, output] samples. */
function run(f: Filter, signal: (t: number) => number, ms: number, dt = DT): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let t = 0; t <= ms; t += dt) {
    const v = signal(t);
    out.push([t, v, f.next(v, t)]);
  }
  return out;
}

/** Steady-state lag in ms on a ramp of `speed` units per second, averaged over the last half. */
function rampLag(f: Filter, speed = 1, dt = DT): number {
  const samples = run(f, (t) => (speed * t) / 1000, 3000, dt).slice(-45);
  const lags = samples.map(([, v, y]) => ((v - y) / speed) * 1000);
  return lags.reduce((a, b) => a + b, 0) / lags.length;
}

const kinds: FilterKind[] = ['none', 'ema', 'kalman', 'oneEuro'];

describe('every filter', () => {
  it.each(kinds)('%s passes the first sample through', (kind) => {
    expect(createFilter(DEFAULT_FILTER_SPECS[kind]).next(0.42, 0)).toBe(0.42);
  });

  it.each(kinds)('%s holds its value for a repeated timestamp', (kind) => {
    const f = createFilter(DEFAULT_FILTER_SPECS[kind]);
    f.next(0, 0);
    const y = f.next(1, 33);
    expect(f.next(5, 33)).toBe(kind === 'none' ? 5 : y);
  });

  it.each(kinds)('%s converges on a step within a second', (kind) => {
    const f = createFilter(DEFAULT_FILTER_SPECS[kind]);
    const out = run(f, (t) => (t < 100 ? 0 : 1), 1100);
    expect(out[out.length - 1]![2]).toBeCloseTo(1, 2);
  });

  it.each(kinds)('%s starts over after reset', (kind) => {
    const f = createFilter(DEFAULT_FILTER_SPECS[kind]);
    f.next(0, 0);
    f.next(0, 33);
    f.reset();
    expect(f.next(7, 66)).toBe(7);
  });

  it.each(kinds.filter((k) => k !== 'none'))('%s tracks slow motion through heavy noise', (kind) => {
    // Slow enough that smoothing removes more noise than its lag adds. (For fast
    // motion the balance flips; that trade-off is what the benchmarks measure.)
    const rand = prng(3);
    const f = createFilter(DEFAULT_FILTER_SPECS[kind]);
    const clean = (t: number) => 0.5 + 0.1 * Math.sin((2 * Math.PI * t) / 5000);
    const out = run(f, (t) => clean(t) + (rand() - 0.5) * 0.04, 10_000).slice(30);
    const err = std(out.map(([t, , y]) => y - clean(t)));
    const noise = std(out.map(([t, v]) => v - clean(t)));
    // Filtered output is closer to the true signal than the raw input is.
    expect(err).toBeLessThan(noise);
  });
});

describe('stationary noise', () => {
  const noisy = () => {
    const rand = prng(7);
    return () => 0.5 + (rand() - 0.5) * 0.01;
  };
  const jitterRatio = (f: Filter) => {
    const sig = noisy();
    const out = run(f, () => sig(), 10_000).slice(30);
    return std(out.map((s) => s[2])) / std(out.map((s) => s[1]));
  };

  it('is untouched by pass-through', () => {
    expect(jitterRatio(new PassThroughFilter())).toBe(1);
  });

  it('is reduced by EMA as its theory predicts', () => {
    // Discrete EMA on white noise: std ratio = sqrt(alpha / (2 - alpha)).
    const alpha = 1 - Math.exp(-DT / 60);
    expect(jitterRatio(new EmaFilter({ tauMs: 60 }))).toBeCloseTo(Math.sqrt(alpha / (2 - alpha)), 1);
  });

  it('is reduced by Kalman and One Euro', () => {
    // Measured 0.41 for this setting; the bound leaves margin without being vacuous.
    expect(jitterRatio(new KalmanFilter({ processNoise: 0.01, measurementNoise: 1e-4 }))).toBeLessThan(0.5);
    expect(jitterRatio(new OneEuroFilter())).toBeLessThan(0.35);
  });

  it('smooths more with Kalman as measurement noise rises or process noise falls', () => {
    const ratio = (q: number, r: number) => jitterRatio(new KalmanFilter({ processNoise: q, measurementNoise: r }));
    expect(ratio(0.2, 1e-4)).toBeLessThan(ratio(0.2, 1e-5));
    expect(ratio(0.2, 1e-5)).toBeLessThan(ratio(0.2, 1e-6));
    expect(ratio(0.01, 1e-5)).toBeLessThan(ratio(0.2, 1e-5));
    expect(ratio(0.2, 1e-5)).toBeLessThan(ratio(2, 1e-5));
  });
});

describe('lag on a constant-speed ramp', () => {
  it('is zero for pass-through', () => {
    expect(rampLag(new PassThroughFilter())).toBeCloseTo(0, 9);
  });

  it('is dt / (e^(dt/tau) - 1) for EMA, approaching tau at high frame rates', () => {
    const expected = DT / (Math.exp(DT / 60) - 1);
    expect(rampLag(new EmaFilter({ tauMs: 60 }))).toBeCloseTo(expected, 1);
    expect(rampLag(new EmaFilter({ tauMs: 60 }), 1, 1)).toBeCloseTo(60, -1);
  });

  it('vanishes for Kalman, whose model is constant velocity', () => {
    expect(Math.abs(rampLag(new KalmanFilter()))).toBeLessThan(1);
  });

  it('shrinks with One Euro beta', () => {
    const slow = rampLag(new OneEuroFilter({ minCutoff: 1.2, beta: 0, dCutoff: 1 }));
    const fast = rampLag(new OneEuroFilter({ minCutoff: 1.2, beta: 8, dCutoff: 1 }));
    expect(slow).toBeGreaterThan(100);
    expect(fast).toBeLessThan(slow / 4);
  });
});

describe('irregular frame intervals', () => {
  it('leave EMA smoothing consistent across frame rates', () => {
    const at30 = rampLag(new EmaFilter({ tauMs: 60 }), 1, 1000 / 30);
    const at60 = rampLag(new EmaFilter({ tauMs: 60 }), 1, 1000 / 60);
    // Both approximate the 60 ms time constant; a fixed-alpha EMA would differ by 2x.
    expect(Math.abs(at30 - at60)).toBeLessThan(12);
  });

  it('are handled by every filter without blowing up', () => {
    const rand = prng(11);
    for (const kind of kinds) {
      const f = createFilter(DEFAULT_FILTER_SPECS[kind]);
      let t = 0;
      let y = 0;
      for (let i = 0; i < 300; i++) {
        t += 15 + rand() * 60;
        y = f.next(0.5, t);
      }
      expect(y).toBeCloseTo(0.5, 6);
    }
  });
});
