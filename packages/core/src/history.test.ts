import { describe, expect, it } from 'vitest';
import { History } from './history.ts';
import type { Stroke } from './types.ts';

const s = (id: string): Stroke => ({ id, brush: 'neon', color: '#fff', size: 1, points: [], createdAt: 0 });
const ids = (h: History) => h.strokes.map((x) => x.id);

describe('History', () => {
  it('undoes and redoes adds', () => {
    const h = new History();
    h.add(s('a'));
    h.add(s('b'));
    h.undo();
    expect(ids(h)).toEqual(['a']);
    h.redo();
    expect(ids(h)).toEqual(['a', 'b']);
  });

  it('restores everything when a clear is undone', () => {
    const h = new History();
    h.add(s('a'));
    h.add(s('b'));
    h.clear();
    expect(ids(h)).toEqual([]);
    h.undo();
    expect(ids(h)).toEqual(['a', 'b']);
  });

  it('swaps strokes for their pieces, and undoes and redoes the swap', () => {
    const h = new History();
    h.add(s('a'));
    h.add(s('b'));
    h.replace([s('a')], [s('a1'), s('a2')]);
    expect(ids(h)).toEqual(['b', 'a1', 'a2']);
    h.undo();
    expect(ids(h)).toEqual(['b', 'a']);
    h.redo();
    expect(ids(h)).toEqual(['b', 'a1', 'a2']);
  });

  it('merges one erase gesture into one undo step', () => {
    const h = new History();
    h.add(s('a'));
    h.add(s('b'));
    h.replace([s('a')], [s('a1'), s('a2')], 'g');
    // The same gesture erases one of the new pieces entirely, then part of b.
    h.replace([s('a1')], [], 'g');
    h.replace([s('b')], [s('b1')], 'g');
    expect(ids(h)).toEqual(['a2', 'b1']);
    h.undo();
    expect(ids(h)).toEqual(['a', 'b']);
    expect(h.canUndo).toBe(true);
    h.undo();
    expect(ids(h)).toEqual(['a']);
    h.redo();
    h.redo();
    expect(ids(h)).toEqual(['a2', 'b1']);
  });

  it('keeps separate gestures as separate undo steps, and ignores empty swaps', () => {
    const h = new History();
    h.add(s('a'));
    const v = h.version;
    h.replace([], [], 'g');
    expect(h.version).toBe(v);
    h.replace([s('a')], [s('a1')], 'g');
    h.replace([s('a1')], [s('a2')], 'h');
    h.undo();
    expect(ids(h)).toEqual(['a1']);
  });

  it('drops the redo stack on a new action', () => {
    const h = new History();
    h.add(s('a'));
    h.undo();
    h.add(s('c'));
    expect(h.canRedo).toBe(false);
    expect(ids(h)).toEqual(['c']);
  });
});
