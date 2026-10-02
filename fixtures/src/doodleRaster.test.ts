// The browser's doodle rasterizer against the cases the training pipeline wrote
// (ml/src/afterglow_ml/parity.py): the model must see the same pixels in both.

import { readFileSync } from 'node:fs';
import { doodleImage } from '@afterglow/core';
import { describe, expect, it } from 'vitest';

interface ParityCase {
  name: string;
  strokes: Array<Array<[number, number]>>;
  pixels: number[];
}

const parity = JSON.parse(readFileSync(new URL('../doodle-raster-parity.json', import.meta.url), 'utf8')) as {
  size: number;
  cases: ParityCase[];
};

describe('doodle rasterizer parity with the training pipeline', () => {
  it.each(parity.cases.map((c) => [c.name, c] as const))('%s', (_, c) => {
    const image = doodleImage(c.strokes.map((s) => s.map(([x, y]) => ({ x, y }))));
    expect(image.length).toBe(parity.size * parity.size);
    let worst = 0;
    image.forEach((v, i) => (worst = Math.max(worst, Math.abs(v - c.pixels[i]!))));
    expect(worst).toBeLessThan(1e-4);
  });
});
