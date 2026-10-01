import { describe, expect, it } from 'vitest';
import { axialDelta, lerpAxial, unwrapAxial } from './angle.ts';

const deg = (d: number) => (d * Math.PI) / 180;

describe('axial angles', () => {
  it('turn the short way, treating θ and θ + π as the same', () => {
    expect(axialDelta(deg(10), deg(30))).toBeCloseTo(deg(20), 9);
    expect(axialDelta(deg(10), deg(175))).toBeCloseTo(deg(-15), 9);
    expect(axialDelta(deg(0), deg(180))).toBeCloseTo(0, 9);
    expect(axialDelta(deg(-80), deg(80))).toBeCloseTo(deg(-20), 9);
  });

  it('interpolate across the wrap', () => {
    expect(lerpAxial(deg(10), deg(175), 0.5)).toBeCloseTo(deg(2.5), 9);
  });

  it('unwrap a sequence so it never jumps half a turn', () => {
    const out = unwrapAxial([deg(170), deg(-175), deg(-160), deg(10)]);
    expect(out.map((a) => Math.round((a * 180) / Math.PI))).toEqual([170, 185, 200, 190]);
  });
});
