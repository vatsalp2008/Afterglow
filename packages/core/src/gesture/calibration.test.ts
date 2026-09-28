import { describe, expect, it } from 'vitest';
import { calibratePinch, MIN_CALIBRATION_SAMPLES } from './calibration.ts';

const repeat = (v: number, n = 30) => Array.from({ length: n }, (_, i) => v + (i % 3) * 0.01);

describe('calibratePinch', () => {
  it('places the thresholds between the pinched and open levels', () => {
    const c = calibratePinch(repeat(0.8), repeat(0.1));
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const { enter, exit, openLevel, pinchedLevel } = c.result;
    expect(pinchedLevel).toBeCloseTo(0.12, 9);
    expect(openLevel).toBeCloseTo(0.8, 9);
    expect(enter).toBeGreaterThan(pinchedLevel);
    expect(exit).toBeGreaterThan(enter);
    expect(exit).toBeLessThan(openLevel);
  });

  it('keeps a minimum hysteresis band', () => {
    const c = calibratePinch(repeat(0.3), repeat(0.12));
    if (!c.ok) throw new Error('expected a calibration');
    expect(c.result.exit - c.result.enter).toBeGreaterThanOrEqual(0.06 - 1e-9);
  });

  it('caps the thresholds for very open hands', () => {
    const c = calibratePinch(repeat(3), repeat(0.9));
    if (!c.ok) throw new Error('expected a calibration');
    expect(c.result.enter).toBe(0.4);
    expect(c.result.exit).toBe(0.6);
  });

  it('refuses when open and pinched look alike', () => {
    expect(calibratePinch(repeat(0.3), repeat(0.25))).toEqual({ ok: false, reason: 'notSeparable' });
  });

  it('refuses with too few samples, ignoring non-finite ones', () => {
    const few = repeat(0.1, MIN_CALIBRATION_SAMPLES - 1);
    expect(calibratePinch(repeat(0.8), [...few, Number.POSITIVE_INFINITY])).toEqual({
      ok: false,
      reason: 'tooFewSamples',
    });
  });
});
