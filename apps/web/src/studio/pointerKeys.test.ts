import { describe, expect, it } from 'vitest';
import { isPointerKey, POINTER_KEY, pointerKey } from './pointerKeys';

describe('pointer keys', () => {
  it('give the mouse and a stylus one pen, and each finger its own', () => {
    expect(pointerKey({ pointerType: 'mouse', pointerId: 1 })).toBe(POINTER_KEY);
    expect(pointerKey({ pointerType: 'pen', pointerId: 7 })).toBe(POINTER_KEY);
    const a = pointerKey({ pointerType: 'touch', pointerId: 2 });
    const b = pointerKey({ pointerType: 'touch', pointerId: 3 });
    expect(a).not.toBe(b);
    expect([a, b].every(isPointerKey)).toBe(true);
  });

  it('tell pointer pens from tracked hands', () => {
    expect(isPointerKey(POINTER_KEY)).toBe(true);
    expect(isPointerKey('hand-1')).toBe(false);
    expect(isPointerKey('pointers')).toBe(false);
  });
});
