// The prompts for recording labeled sets (?record=shapes, ?record=doodles): what to
// draw, and for how long. Kinds are interleaved, so no shape is drawn six times in a
// row and practice doesn't pile up on one.

import type { LabeledKind } from '@afterglow/core';

export interface Prompt {
  /** The label saved with the strokes. */
  label: string;
  /** What the person is asked to draw. */
  text: string;
  durationMs: number;
}

const SHAPES: ReadonlyArray<Omit<Prompt, 'durationMs'>> = [
  { label: 'line', text: 'a straight line' },
  { label: 'circle', text: 'a circle' },
  { label: 'rectangle', text: 'a rectangle' },
  { label: 'triangle', text: 'a triangle' },
  { label: 'arrow', text: 'an arrow, in one stroke: the line, then the head' },
  { label: 'ellipse', text: 'an oval, wider than it is tall' },
];

/** Strokes that must not snap: some open, some closed. */
const LOOSE = [
  'a wavy line',
  'a spiral',
  'the letter S',
  'a scribble',
  'a zigzag',
  'a heart',
  'a loop-de-loop',
  'a five-pointed star',
  'the letter M',
  'a cloud',
  'the number 8',
  'a lightning bolt',
];

const ROUNDS = 6;

export const SHAPE_PROMPTS: readonly Prompt[] = Array.from({ length: ROUNDS }, (_, round) => [
  // Each round starts at a different shape.
  ...SHAPES.map((_, i) => SHAPES[(i + round) % SHAPES.length]!).map((s) => ({ ...s, durationMs: 5000 })),
  ...LOOSE.slice(round * 2, round * 2 + 2).map((text) => ({ label: 'loose', text, durationMs: 7000 })),
]).flat();

/**
 * Twelve of the doodle model's subjects, three times each. Labels are the Quick, Draw!
 * class names the model is trained on.
 */
const DOODLES: ReadonlyArray<Omit<Prompt, 'durationMs'>> = [
  { label: 'cat', text: 'a cat' },
  { label: 'house', text: 'a house' },
  { label: 'sun', text: 'the sun' },
  { label: 'fish', text: 'a fish' },
  { label: 'tree', text: 'a tree' },
  { label: 'flower', text: 'a flower' },
  { label: 'smiley face', text: 'a smiley face' },
  { label: 'moon', text: 'the moon' },
  { label: 'star', text: 'a star' },
  { label: 'apple', text: 'an apple' },
  { label: 'cloud', text: 'a cloud' },
  { label: 'umbrella', text: 'an umbrella' },
];

export const DOODLE_PROMPTS: readonly Prompt[] = Array.from({ length: 3 }, (_, round) =>
  // A stride of 5 visits all twelve; starting one later each round never repeats across rounds.
  DOODLES.map((_, i) => DOODLES[(i * 5 + round) % DOODLES.length]!).map((d) => ({ ...d, durationMs: 12_000 })),
).flat();

export const PROMPTS: Record<LabeledKind, readonly Prompt[]> = { shapes: SHAPE_PROMPTS, doodles: DOODLE_PROMPTS };

/** Air-drawn doodle labels, for checking they're all classes the model knows. */
export const AIR_DOODLE_LABELS: readonly string[] = DOODLES.map((d) => d.label);
