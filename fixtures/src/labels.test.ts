import { describe, expect, it } from 'vitest';
import { fixtureNames, loadFixture, loadLabels } from './load.ts';

describe('labels', () => {
  const labels = loadLabels();

  it('cover exactly the recorded fixtures', () => {
    expect(Object.keys(labels).sort()).toEqual(fixtureNames());
  });

  it.each(fixtureNames())('%s has pinch intervals inside its recording', (name) => {
    const pinched = labels[name]?.pinched ?? [];
    const duration = loadFixture(name).frames.at(-1)?.captureTime ?? 0;
    for (const [a, b] of pinched) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(duration);
    }
    // Intervals are ordered and don't overlap.
    for (let i = 1; i < pinched.length; i++) expect(pinched[i]![0]).toBeGreaterThan(pinched[i - 1]![1]);
  });
});
