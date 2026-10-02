import { describe, expect, it } from 'vitest';
import type { Stroke } from '../types.ts';
import { groupKey, groupSettled, latestGroup } from './group.ts';

const stroke = (id: string, from: number, to: number, shape?: Stroke['shape']): Stroke => ({
  id,
  brush: 'neon',
  color: '#FFB547',
  size: 11,
  createdAt: from,
  points: [
    { x: 0, y: 0, depth: 1, t: from },
    { x: 10, y: 10, depth: 1, t: to },
  ],
  ...(shape ? { shape } : {}),
});

describe('latestGroup', () => {
  it('collects the strokes drawn close together, newest last', () => {
    const strokes = [stroke('old', 0, 500), stroke('a', 5000, 5600), stroke('b', 6500, 7000), stroke('c', 8500, 9000)];
    expect(latestGroup(strokes).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('follows drawing time, not the order strokes were stored', () => {
    // A snapped stroke is stored after its neighbours (History.replace appends).
    const strokes = [stroke('b', 6500, 7000), stroke('c', 8500, 9000), stroke('a', 5000, 5600)];
    expect(latestGroup(strokes).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('ignores groups made only of snapped shapes', () => {
    expect(latestGroup([stroke('circle', 0, 500, 'circle')])).toEqual([]);
    expect(latestGroup([stroke('circle', 0, 500, 'circle'), stroke('eye', 800, 900)])).toHaveLength(2);
  });
});

describe('groupSettled', () => {
  const group = [stroke('a', 1000, 2000)];
  it('waits a moment after the last stroke', () => {
    expect(groupSettled(group, 3000)).toBe(false);
    expect(groupSettled(group, 3500)).toBe(true);
    expect(groupSettled([], 10_000)).toBe(false);
  });

  it('keys groups by their strokes', () => {
    expect(groupKey([stroke('a', 0, 1), stroke('b', 2, 3)])).toBe('a,b');
  });
});
