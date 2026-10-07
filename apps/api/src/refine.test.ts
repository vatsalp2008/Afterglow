import { describe, expect, it } from 'vitest';
import { checkAnswer, RefineError, refineSketch, type RefineModel } from './refine.ts';

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

describe('refineSketch', () => {
  it('abandons a stuck attempt and asks again', async () => {
    let calls = 0;
    const model: RefineModel = {
      name: 'stuck once',
      refine: (_, signal) => {
        calls++;
        if (calls > 1) return Promise.resolve({ title: 'a sun', paths: [{ d: 'M0 0 L10 10' }] });
        return new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new RefineError('timeout', 'stuck'))),
        );
      },
    };
    const { attempts } = await refineSketch(model, new Uint8Array(), new AbortController().signal, 20);
    expect(attempts).toBe(2);
  });
});
