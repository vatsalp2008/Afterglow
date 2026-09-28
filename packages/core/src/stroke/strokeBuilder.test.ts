import { describe, expect, it } from 'vitest';
import type { InputEvent } from '../types.ts';
import { MIN_POINT_DISTANCE, StrokeBuilder } from './strokeBuilder.ts';

const frame = { width: 1000, height: 500 };
const style = { brush: 'neon' as const, color: '#FFB547', size: 10 };
const p = (x: number, y: number) => ({ x, y, depth: 1 });

function builder() {
  let n = 0;
  return new StrokeBuilder(() => `s${String(++n)}`);
}

describe('StrokeBuilder', () => {
  it('starts a stroke in canvas space with the current style', () => {
    const r = builder().handle({ type: 'strokeStart', t: 5, handKey: 'Right', p: p(0.5, 0.2) }, style, frame);
    expect(r).toMatchObject({
      kind: 'start',
      stroke: { id: 's1', brush: 'neon', color: '#FFB547', size: 10, createdAt: 5, points: [{ x: 500, y: 100, t: 5 }] },
    });
  });

  it('drops moves closer than the minimum distance and reports real segments', () => {
    const b = builder();
    b.handle({ type: 'strokeStart', t: 0, handKey: 'Right', p: p(0.5, 0.5) }, style, frame);
    const tiny = MIN_POINT_DISTANCE / 2 / frame.width;
    expect(b.handle({ type: 'strokeMove', t: 1, handKey: 'Right', p: p(0.5 + tiny, 0.5) }, style, frame).kind).toBe(
      'none',
    );
    const r = b.handle({ type: 'strokeMove', t: 2, handKey: 'Right', p: p(0.6, 0.5) }, style, frame);
    expect(r).toMatchObject({ kind: 'move', from: { x: 500 }, to: { x: 600 } });
  });

  it('keeps one open stroke per hand', () => {
    const b = builder();
    b.handle({ type: 'strokeStart', t: 0, handKey: 'Left', p: p(0.1, 0.1) }, style, frame);
    b.handle({ type: 'strokeStart', t: 0, handKey: 'Right', p: p(0.9, 0.9) }, style, frame);
    expect(b.activeStrokes()).toHaveLength(2);
    const ended = b.handle({ type: 'strokeEnd', t: 1, handKey: 'Left', reason: 'release' }, style, frame);
    expect(ended).toMatchObject({ kind: 'end', stroke: { id: 's1' } });
    expect(b.activeStrokes().map((s) => s.id)).toEqual(['s2']);
  });

  it('ignores moves, ends, and hovers without an open stroke', () => {
    const b = builder();
    const events: InputEvent[] = [
      { type: 'hover', t: 0, handKey: 'Right', p: p(0.5, 0.5) },
      { type: 'strokeMove', t: 0, handKey: 'Right', p: p(0.5, 0.5) },
      { type: 'strokeEnd', t: 0, handKey: 'Right', reason: 'handLost' },
    ];
    for (const ev of events) expect(b.handle(ev, style, frame).kind).toBe('none');
  });

  it('finishes every open stroke at once', () => {
    const b = builder();
    b.handle({ type: 'strokeStart', t: 0, handKey: 'Left', p: p(0.1, 0.1) }, style, frame);
    b.handle({ type: 'strokeStart', t: 0, handKey: 'Right', p: p(0.9, 0.9) }, style, frame);
    expect(b.finishAll()).toHaveLength(2);
    expect(b.activeStrokes()).toHaveLength(0);
  });
});
