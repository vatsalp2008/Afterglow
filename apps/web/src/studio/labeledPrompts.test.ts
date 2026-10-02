import { describe, expect, it } from 'vitest';
import { DOODLE_PROMPTS, SHAPE_PROMPTS } from './labeledPrompts';

const count = (labels: string[]) =>
  labels.reduce<Record<string, number>>((c, l) => ({ ...c, [l]: (c[l] ?? 0) + 1 }), {});

describe('labeled prompts', () => {
  it('ask for each shape six times, and twelve loose strokes', () => {
    expect(count(SHAPE_PROMPTS.map((p) => p.label))).toEqual({
      line: 6,
      circle: 6,
      rectangle: 6,
      triangle: 6,
      arrow: 6,
      ellipse: 6,
      loose: 12,
    });
    expect(new Set(SHAPE_PROMPTS.filter((p) => p.label === 'loose').map((p) => p.text)).size).toBe(12);
  });

  it('never ask for the same shape twice in a row', () => {
    for (const prompts of [SHAPE_PROMPTS, DOODLE_PROMPTS]) {
      prompts.slice(1).forEach((p, i) => {
        if (p.label !== 'loose') expect(p.label).not.toBe(prompts[i]!.label);
      });
    }
  });

  it('ask for each doodle three times', () => {
    const counts = count(DOODLE_PROMPTS.map((p) => p.label));
    expect(Object.keys(counts)).toHaveLength(12);
    expect(Object.values(counts).every((n) => n === 3)).toBe(true);
  });
});
