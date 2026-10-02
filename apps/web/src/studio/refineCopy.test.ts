import { describe, expect, it } from 'vitest';
import { refineProblem } from './refineCopy';

describe('refineProblem', () => {
  it('follows the API’s error, then its status', () => {
    expect(refineProblem(429, 'rateLimited')).toBe('rateLimited');
    expect(refineProblem(502, 'invalidOutput')).toBe('invalidOutput');
    expect(refineProblem(413, 'tooLarge')).toBe('badImage');
    expect(refineProblem(504, undefined)).toBe('timeout');
    expect(refineProblem(502, 'somethingNew')).toBe('unavailable');
    expect(refineProblem(404, undefined)).toBe('notConfigured');
  });
});
