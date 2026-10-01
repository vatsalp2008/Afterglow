// `?stress=N` (N strokes; `?stress=1` means 500): synthetic strokes for render
// performance testing. Clearly labelled in the UI; never mixed into a real session silently.
// Lengths, timing, and brushes vary like real drawing, so geometry size and fade ages are
// realistic: 20 to 200 points per stroke, sampled every 16 to 33 ms.

import type { BrushId, FrameSize, Stroke, StrokePoint } from '@afterglow/core';
import { BRUSH_COLORS } from '@afterglow/ui/tokens';

export const STRESS_STROKES = 500;

const BRUSH_MIX: BrushId[] = ['neon', 'neon', 'neon', 'sparks', 'neon', 'neon', 'ink', 'neon', 'neon', 'neon'];

function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** The stroke count for a `?stress` value: a number above 1, or the default. */
export function stressCount(param: string | null): number {
  const n = Number(param);
  return Number.isInteger(n) && n > 1 ? n : STRESS_STROKES;
}

export function stressStrokes(frame: FrameSize, t: number, createId: () => string, count = STRESS_STROKES): Stroke[] {
  const rand = prng(42);
  let clock = 0;
  const strokes = Array.from({ length: count }, (_, n): Stroke => {
    const cx = rand() * frame.width;
    const cy = rand() * frame.height;
    const r = 20 + rand() * 90;
    const turns = 0.5 + rand() * 1.5;
    const phase = rand() * Math.PI * 2;
    const length = 20 + Math.floor(rand() * 181);
    const start = clock;
    const points: StrokePoint[] = Array.from({ length }, (_, i) => {
      const u = i / (length - 1);
      const a = phase + u * turns * Math.PI * 2;
      clock += 16 + rand() * 17;
      return {
        x: cx + Math.cos(a) * r * (0.4 + u),
        y: cy + Math.sin(a * 1.3) * r,
        depth: 0.7 + rand() * 0.6,
        t: clock,
      };
    });
    clock += 200;
    return {
      id: createId(),
      brush: BRUSH_MIX[n % BRUSH_MIX.length]!,
      color: BRUSH_COLORS[n % BRUSH_COLORS.length]!.hex,
      size: 6 + rand() * 10,
      points,
      createdAt: start,
    };
  });
  // Drawn one after another, the last one finishing at `t`.
  const shift = t - (strokes.at(-1)?.points.at(-1)?.t ?? 0);
  return strokes.map((s) => ({
    ...s,
    createdAt: s.createdAt + shift,
    points: s.points.map((p) => ({ ...p, t: p.t + shift })),
  }));
}
