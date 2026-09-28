import { describe, expect, it } from 'vitest';
import { OneEuroFilter } from './oneEuro.ts';

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

describe('OneEuroFilter', () => {
  it('passes the first sample through unchanged', () => {
    expect(new OneEuroFilter().next(0.42, 0)).toBe(0.42);
  });

  it('removes most jitter from a stationary noisy signal', () => {
    const f = new OneEuroFilter();
    const rand = prng(7);
    const raw: number[] = [];
    const out: number[] = [];
    for (let i = 0; i < 300; i++) {
      const x = 0.5 + (rand() - 0.5) * 0.01;
      raw.push(x);
      out.push(f.next(x, i * (1000 / 30)));
    }
    expect(std(out.slice(30))).toBeLessThan(std(raw.slice(30)) * 0.35);
  });

  it('converges on a step', () => {
    const f = new OneEuroFilter();
    f.next(0, 0);
    let y = 0;
    for (let i = 1; i <= 60; i++) y = f.next(1, i * (1000 / 60));
    expect(y).toBeGreaterThan(0.99);
  });

  it('starts over after reset', () => {
    const f = new OneEuroFilter();
    f.next(0, 0);
    f.next(0, 33);
    f.reset();
    expect(f.next(5, 66)).toBe(5);
  });
});
