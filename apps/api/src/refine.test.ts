import { describe, expect, it } from 'vitest';
import { checkAnswer } from './refine.ts';

describe('checkAnswer', () => {
  it('accepts a title and up to 40 valid paths', () => {
    expect(checkAnswer({ title: ' a sun ', paths: [{ d: 'M500 500 m-100 0 a100 100 0 1 0 200 0' }] })).toEqual({
      title: 'a sun',
      paths: [{ d: 'M500 500 m-100 0 a100 100 0 1 0 200 0' }],
    });
  });

  it.each([
    ['no paths', { title: 'x', paths: [] }],
    ['too many paths', { title: 'x', paths: Array.from({ length: 41 }, () => ({ d: 'M0 0 L1 1' })) }],
    ['a path that isn’t path data', { title: 'x', paths: [{ d: '<circle r="5"/>' }] }],
    ['no title', { paths: [{ d: 'M0 0 L1 1' }] }],
    ['a list', [{ d: 'M0 0 L1 1' }]],
  ])('rejects %s', (_, answer) => {
    expect(checkAnswer(answer)).toBeNull();
  });
});
