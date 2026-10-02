import { describe, expect, it } from 'vitest';
import type { Stroke } from '../types.ts';
import { parseLabeledSet, toLabeledSet } from './labeled.ts';

const stroke: Stroke = {
  id: 's1',
  brush: 'neon',
  color: '#FFB547',
  size: 11,
  createdAt: 0,
  points: [
    { x: 10.123456, y: 20, depth: 1, t: 0 },
    { x: 30, y: 40, depth: 1, t: 16 },
  ],
};
const frame = { width: 1333.333, height: 1000 };
const set = () => toLabeledSet('shapes', 'p1', '2026-10-01T12:00:00Z', frame, [{ label: 'circle', strokes: [stroke] }]);

describe('labeled sets', () => {
  it('round-trip, rounded like drawing files', () => {
    const parsed = parseLabeledSet(JSON.stringify(set()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.set).toEqual(set());
    expect(parsed.set.items[0]!.strokes[0]!.points[0]!.x).toBe(10.12);
  });

  it.each<[string, (d: Record<string, unknown>) => void, RegExp]>([
    ['another format', (d) => (d['format'] = 'afterglow.drawing'), /not a labeled set/],
    ['another kind', (d) => (d['kind'] = 'letters'), /unknown kind/],
    ['a name for a person', (d) => (d['person'] = 'Vatsal Patel'), /bad person id/],
    ['a label with symbols', (d) => ((d['items'] as Array<Record<string, unknown>>)[0]!['label'] = '<b>'), /bad label/],
    [
      'a damaged stroke',
      (d) => ((d['items'] as Array<{ strokes: Array<Record<string, unknown>> }>)[0]!.strokes[0]!['color'] = 'red'),
      /damaged/,
    ],
  ])('reject %s', (_, damage, problem) => {
    const d = JSON.parse(JSON.stringify(set())) as Record<string, unknown>;
    damage(d);
    const parsed = parseLabeledSet(JSON.stringify(d));
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.problem).toMatch(problem);
  });
});
