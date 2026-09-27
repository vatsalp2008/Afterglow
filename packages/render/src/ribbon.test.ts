import type { Stroke } from '@afterglow/core';
import { describe, expect, it } from 'vitest';
import { buildRibbon } from './ribbon';

function stroke(points: Array<[number, number]>): Stroke {
  return {
    id: 's',
    brush: 'neon',
    color: '#FFB547',
    size: 10,
    createdAt: 0,
    points: points.map(([x, y], i) => ({ x, y, depth: 1, t: i })),
  };
}

const attr = (geo: ReturnType<typeof buildRibbon>, name: string) => Array.from(geo.getAttribute(name).array);

describe('buildRibbon', () => {
  it('returns empty geometry for a stroke without points', () => {
    expect(buildRibbon(stroke([]), 1).getAttribute('position')).toBeUndefined();
  });

  it('draws a single point as a filled disc', () => {
    const geo = buildRibbon(stroke([[5, 5]]), 1);
    expect(geo.getAttribute('position').count).toBe(18); // center + 17 rim vertices
    expect(geo.getIndex()?.count).toBe(16 * 3);
  });

  it('builds a ribbon of the stroke width with a round cap at each end', () => {
    const geo = buildRibbon(
      stroke([
        [0, 0],
        [2, 0],
        [4, 0],
      ]),
      1,
    );
    // 3 points x 2 ribbon vertices, plus 2 caps x (center + 9 rim)
    expect(geo.getAttribute('position').count).toBe(6 + 20);
    const ys = attr(geo, 'position')
      .filter((_, i) => i % 3 === 1)
      .slice(0, 6);
    for (const y of ys) expect(Math.abs(y)).toBeCloseTo(5, 9);
  });

  it('keeps the across coordinate within [-1, 1] for the shader', () => {
    const across = attr(
      buildRibbon(
        stroke([
          [0, 0],
          [30, 10],
          [60, -5],
        ]),
        1,
      ),
      'aAcross',
    );
    expect(Math.min(...across)).toBe(-1);
    expect(Math.max(...across)).toBe(1);
  });

  it('scales width with depth', () => {
    const near = stroke([
      [0, 0],
      [2, 0],
    ]);
    for (const p of near.points) p.depth = 2;
    const y = attr(buildRibbon(near, 1), 'position')[1]!;
    expect(Math.abs(y)).toBeCloseTo(10, 9);
  });
});
