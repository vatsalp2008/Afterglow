import { describe, expect, it } from 'vitest';
import { stamp } from './download';

describe('stamp', () => {
  it('uses local time, padded', () => {
    expect(stamp(new Date(2026, 0, 2, 3, 4, 5))).toBe('2026-01-02-03-04-05');
  });
});
