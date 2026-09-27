import { describe, expect, it } from 'vitest';
import { RateCounter, RollingStats } from './telemetry';

describe('RollingStats', () => {
  it('reports null before any samples', () => {
    expect(new RollingStats().percentile(50)).toBeNull();
  });

  it('computes percentiles over the most recent window only', () => {
    const s = new RollingStats(4);
    for (const v of [100, 1, 2, 3, 4]) s.push(v);
    expect(s.percentile(50)).toBe(3);
    expect(s.percentile(95)).toBe(4);
  });
});

describe('RateCounter', () => {
  it('counts events in the last second', () => {
    const r = new RateCounter();
    for (let t = 0; t <= 2000; t += 100) r.tick(t);
    expect(r.rate(2000)).toBe(11);
    expect(r.rate(3500)).toBe(0);
  });
});
