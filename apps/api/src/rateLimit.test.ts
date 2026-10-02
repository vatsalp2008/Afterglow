import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rateLimit.ts';

describe('RateLimiter', () => {
  it('allows a few a minute and a few dozen a day, per client', () => {
    let now = 0;
    const limiter = new RateLimiter({ perMinute: 2, perDay: 3 }, () => now);
    expect(limiter.take('a')).toBe(0);
    expect(limiter.take('a')).toBe(0);
    now = 10_000;
    expect(limiter.take('a')).toBe(50);
    expect(limiter.take('b')).toBe(0);
    now = 61_000;
    expect(limiter.take('a')).toBe(0);
    now = 130_000;
    // Three today already: wait for the first to be a day old.
    expect(limiter.take('a')).toBe(86_400 - 130);
  });
});
