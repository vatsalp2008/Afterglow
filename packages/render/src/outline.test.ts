import type { Stroke } from '@afterglow/core';
import { describe, expect, it } from 'vitest';
import { buildNib } from './nib';
import { nibDab, nibSections, stripSections } from './outline';
import { buildStrip } from './strip';

function stroke(brush: Stroke['brush'], n: number): Stroke {
  return {
    id: 's',
    brush,
    color: '#FFB547',
    size: 12,
    createdAt: 0,
    points: Array.from({ length: n }, (_, i) => ({
      x: 100 + i * 9,
      y: 200 + Math.sin(i) * 14,
      depth: 0.6 + (i % 4) * 0.3,
      t: i * 16,
      angle: i * 0.4,
    })),
  };
}

/** The first 2 × count vertices of a strip: left and right edge of each section. */
function edges(positions: ArrayLike<number>, count: number): number[] {
  return Array.from({ length: count * 2 * 2 }, (_, k) => positions[Math.floor(k / 2) * 3 + (k % 2)]!);
}

function sectionEdges(sections: ReturnType<typeof stripSections>): number[] {
  return sections.flatMap(({ point: p, nx, ny, half }) => [
    p.x + nx * half,
    p.y + ny * half,
    p.x - nx * half,
    p.y - ny * half,
  ]);
}

describe('outlines', () => {
  it('are the edges the strip geometry is built from', () => {
    const s = stroke('neon', 12);
    const sections = stripSections(s, 0.35);
    const positions = buildStrip(s, 0.35).getAttribute('position').array;
    expect(edges(positions, sections.length)).toEqual(sectionEdges(sections).map(Math.fround));
  });

  it('are the edges the ribbon geometry is built from', () => {
    const s = stroke('ribbon', 12);
    const sections = nibSections(s);
    const positions = buildNib(s).getAttribute('position').array;
    expect(edges(positions, sections.length)).toEqual(sectionEdges(sections).map(Math.fround));
  });

  it('draw a one-point ribbon as the dab quad', () => {
    const s = stroke('ribbon', 1);
    const quad = nibDab(s, s.points[0]!).flatMap((c) => [c.x, c.y]);
    expect(edges(buildNib(s).getAttribute('position').array, 2)).toEqual(quad.map(Math.fround));
  });
});
