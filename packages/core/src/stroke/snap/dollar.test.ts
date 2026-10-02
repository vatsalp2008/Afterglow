import { describe, expect, it } from 'vitest';
import type { Vec2 } from '../../types.ts';
import { recognize, shapeTemplates } from './dollar.ts';
import { resample } from './path.ts';

const templates = shapeTemplates();

const circle = (start: number, reverse: boolean): Vec2[] =>
  Array.from({ length: 65 }, (_, k) => {
    const a = start + ((reverse ? -1 : 1) * 2 * Math.PI * k) / 64;
    return { x: 300 + 80 * Math.cos(a), y: 200 + 80 * Math.sin(a) };
  });

describe('$1 recognizer', () => {
  it('recognizes shapes whatever their position, size, and drawing direction', () => {
    expect(recognize(circle(1, false), templates)?.name).toBe('circle');
    expect(recognize(circle(2.5, true), templates)?.name).toBe('circle');
    const square = [
      { x: 10, y: 10 },
      { x: 410, y: 10 },
      { x: 410, y: 410 },
      { x: 10, y: 410 },
      { x: 10, y: 10 },
    ];
    const match = recognize(resample(square, 40), templates);
    expect(match?.name).toBe('rectangle');
    expect(match!.score).toBeGreaterThan(0.95);
  });

  it('tolerates rotation within its search range', () => {
    const tri = [
      { x: 0, y: -100 },
      { x: 87, y: 50 },
      { x: -87, y: 50 },
      { x: 0, y: -100 },
    ];
    const turned = tri.map((p) => ({
      x: p.x * Math.cos(0.4) - p.y * Math.sin(0.4),
      y: p.x * Math.sin(0.4) + p.y * Math.cos(0.4),
    }));
    expect(recognize(turned, templates)?.name).toBe('triangle');
  });

  it('scores unlike strokes low', () => {
    const zigzag = Array.from({ length: 9 }, (_, i) => ({ x: i * 40, y: i % 2 ? 60 : 0 }));
    expect(recognize(zigzag, templates)!.score).toBeLessThan(0.8);
  });

  it('needs templates and a path', () => {
    expect(recognize(circle(0, false), [])).toBeNull();
    expect(recognize([{ x: 0, y: 0 }], templates)).toBeNull();
  });
});
