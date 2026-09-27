import { describe, expect, it } from 'vitest';
import { History } from './history';
import type { Stroke } from './types';

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

  it('drops the redo stack on a new action', () => {
    const h = new History();
    h.add(s('a'));
    h.undo();
    h.add(s('c'));
    expect(h.canRedo).toBe(false);
    expect(ids(h)).toEqual(['c']);
  });
});
