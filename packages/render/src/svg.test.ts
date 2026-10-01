import type { Stroke } from '@afterglow/core';
import { describe, expect, it } from 'vitest';
import { strokesToSvg } from './svg';

const view = { left: 100, top: 0, right: 1700, bottom: 900 };

function stroke(id: string, brush: Stroke['brush'], n = 6, color = '#5CE1E6'): Stroke {
  return {
    id,
    brush,
    color,
    size: 12,
    createdAt: 0,
    points: Array.from({ length: n }, (_, i) => ({ x: 300 + i * 20, y: 400 + i * 5, depth: 1, t: i * 16 })),
  };
}

const strokeIds = (svg: string) => [...svg.matchAll(/data-stroke="([^"]+)"/g)].map((m) => m[1]);

describe('strokesToSvg', () => {
  it('crops to the visible canvas and paints the night background', () => {
    const svg = strokesToSvg([], view);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(svg).toContain('viewBox="100 0 1600 900"');
    expect(svg).toContain('fill="url(#night)"');
    expect(strokeIds(svg)).toEqual([]);
    expect(svg).not.toContain('<use');
  });

  it('draws each stroke once, with ink above the light', () => {
    const svg = strokesToSvg(
      [stroke('a', 'neon'), stroke('b', 'ink'), stroke('c', 'ribbon'), stroke('d', 'sparks')],
      view,
    );
    expect(strokeIds(svg)).toEqual(['a', 'c', 'd', 'b']);
    expect(svg.indexOf('<g id="highlights">')).toBeGreaterThan(svg.lastIndexOf('<use'));
    expect(svg.indexOf('<g id="ink">')).toBeGreaterThan(svg.lastIndexOf('<use'));
    expect(svg.match(/<use /g)).toHaveLength(4);
  });

  it('draws dots and one-point ribbons', () => {
    const svg = strokesToSvg([stroke('dot', 'neon', 1), stroke('dab', 'ribbon', 1)], view);
    expect(svg).toMatch(/data-stroke="dot"[^>]* d="M[^"]*A/);
    expect(svg).toMatch(/data-stroke="dab"[^>]* d="M[^"]*Z"/);
  });

  it('skips empty strokes and writes only finite numbers', () => {
    const svg = strokesToSvg([stroke('e', 'neon', 0), stroke('f', 'ribbon', 30)], view);
    expect(strokeIds(svg)).toEqual(['f']);
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('never writes an unexpected color or id into the markup', () => {
    const svg = strokesToSvg([stroke('x"><script>', 'neon', 3, 'red" onload="x')], view);
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('onload');
    expect(svg).toContain('fill="#FFFFFF"');
  });
});
