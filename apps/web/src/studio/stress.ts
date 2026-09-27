// `?stress=1`: synthetic strokes for render performance testing. Clearly
// labelled in the UI; never mixed into a real session silently.

import type { FrameSize, Stroke, StrokePoint } from '@afterglow/core';
import { BRUSH_COLORS } from '@afterglow/ui/tokens';

export const STRESS_STROKES = 500;

function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function stressStrokes(frame: FrameSize, t: number, createId: () => string): Stroke[] {
  const rand = prng(42);
  return Array.from({ length: STRESS_STROKES }, (_, n): Stroke => {
    const cx = rand() * frame.width;
    const cy = rand() * frame.height;
    const r = 20 + rand() * 90;
    const turns = 0.5 + rand() * 1.5;
    const phase = rand() * Math.PI * 2;
    const points: StrokePoint[] = Array.from({ length: 40 }, (_, i) => {
      const u = i / 39;
      const a = phase + u * turns * Math.PI * 2;
      return { x: cx + Math.cos(a) * r * (0.4 + u), y: cy + Math.sin(a * 1.3) * r, depth: 0.7 + rand() * 0.6, t: t + n };
    });
    return {
      id: createId(),
      brush: n % 10 === 0 ? 'ink' : 'neon',
      color: BRUSH_COLORS[n % BRUSH_COLORS.length]!.hex,
      size: 6 + rand() * 10,
      points,
      createdAt: t + n,
    };
  });
}
