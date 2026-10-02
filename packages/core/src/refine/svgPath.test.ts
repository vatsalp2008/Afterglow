import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../types.ts';
import { svgPathToPolylines } from './svgPath.ts';

const gaps = (line: Vec2[]) => line.slice(1).map((p, i) => Math.hypot(p.x - line[i]!.x, p.y - line[i]!.y));
const ends = (line: Vec2[]) => [line[0], line[line.length - 1]];

describe('svgPathToPolylines', () => {
  it('samples straight lines densely, ending exactly at each vertex', () => {
    const [line] = svgPathToPolylines('M10 10 L110 10 L110 60')!;
    expect(ends(line!)).toEqual([
      { x: 10, y: 10 },
      { x: 110, y: 60 },
    ]);
    expect(Math.max(...gaps(line!))).toBeLessThanOrEqual(2.5 + 1e-9);
    expect(line).toContainEqual({ x: 110, y: 10 });
  });

  it('reads relative commands, H and V, and implicit linetos after a moveto', () => {
    const [line] = svgPathToPolylines('m10,10 20,0 h30 v40 l-50 0', 10)!;
    expect(ends(line!)).toEqual([
      { x: 10, y: 10 },
      { x: 10, y: 50 },
    ]);
    expect(line).toContainEqual({ x: 30, y: 10 });
    expect(line).toContainEqual({ x: 60, y: 10 });
    expect(line).toContainEqual({ x: 60, y: 50 });
  });

  it('closes subpaths back to their start, one polyline each', () => {
    const lines = svgPathToPolylines('M0 0 H100 V100 Z M200 200 l50 0')!;
    expect(lines).toHaveLength(2);
    expect(ends(lines[0]!)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(lines[1]![0]).toEqual({ x: 200, y: 200 });
  });

  it('samples cubic and quadratic curves, with smooth reflections', () => {
    const [cubic] = svgPathToPolylines('M0 0 C0 100 100 100 100 0 S200 -100 200 0')!;
    expect(ends(cubic!)).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ]);
    // The first curve bulges down to y = 75 at its middle; the reflected one up to -75.
    expect(Math.max(...cubic!.map((p) => p.y))).toBeCloseTo(75, 0);
    expect(Math.min(...cubic!.map((p) => p.y))).toBeCloseTo(-75, 0);
    const [quad] = svgPathToPolylines('M0 0 Q50 100 100 0 T200 0')!;
    expect(Math.max(...quad!.map((p) => p.y))).toBeCloseTo(50, 0);
    expect(Math.min(...quad!.map((p) => p.y))).toBeCloseTo(-50, 0);
  });

  it('draws arcs around their center', () => {
    const [arc] = svgPathToPolylines('M0 100 A100 100 0 0 1 200 100')!;
    expect(ends(arc!)).toEqual([
      { x: 0, y: 100 },
      { x: 200, y: 100 },
    ]);
    for (const p of arc!) expect(Math.hypot(p.x - 100, p.y - 100)).toBeCloseTo(100, 6);
    // Sweep flag 1 goes clockwise on screen (y down): over the top, through y = 0.
    expect(Math.min(...arc!.map((p) => p.y))).toBeCloseTo(0, 1);
  });

  it('reads arc flags packed without separators', () => {
    const packed = svgPathToPolylines('M0 100a100 100 0 0110 0')!;
    const spaced = svgPathToPolylines('M0 100a100 100 0 0 1 10 0')!;
    expect(packed).toEqual(spaced);
  });

  it('reads packed numbers', () => {
    const [line] = svgPathToPolylines('M.5.5L-1.5e1-.5', 100)!;
    expect(ends(line!)).toEqual([
      { x: 0.5, y: 0.5 },
      { x: -15, y: -0.5 },
    ]);
  });

  it.each([
    ['text', 'hello'],
    ['a missing coordinate', 'M10'],
    ['numbers before any command', '10 10 L 20 20'],
    ['a bad arc flag', 'M0 0 A10 10 0 2 1 10 10'],
    ['a moveto and nothing else', 'M10 10'],
    ['an empty string', ''],
  ])('rejects %s', (_, d) => {
    expect(svgPathToPolylines(d)).toBeNull();
  });

  it('refuses unreasonably large paths', () => {
    expect(svgPathToPolylines('M0 0 L1e9 0')).toBeNull();
    expect(svgPathToPolylines(`M0 0 ${'L1 1 '.repeat(2000)}`)).toBeNull();
  });
});
