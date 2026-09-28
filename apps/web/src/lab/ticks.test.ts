import { describe, expect, it } from 'vitest';
import { niceTicks, paddedExtent } from './ticks';

describe('niceTicks', () => {
  it('picks round steps inside the range', () => {
    expect(niceTicks(0, 10)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(3, 97, 4)).toEqual([20, 40, 60, 80]);
    expect(niceTicks(0.12, 0.61)).toEqual([0.2, 0.3, 0.4, 0.5, 0.6]);
    expect(niceTicks(-1.5, 1.5, 6)).toEqual([-1.5, -1, -0.5, 0, 0.5, 1, 1.5]);
  });

  it('handles empty and degenerate ranges', () => {
    expect(niceTicks(5, 5)).toEqual([5]);
    expect(niceTicks(2, 1)).toEqual([]);
    expect(niceTicks(0, Number.NaN)).toEqual([]);
  });
});

describe('paddedExtent', () => {
  it('pads the range', () => {
    expect(paddedExtent([0, 10, 5])).toEqual([-0.5, 10.5]);
    expect(paddedExtent([2])).toEqual([1.9, 2.1]);
    expect(paddedExtent([])).toBeNull();
  });
});
