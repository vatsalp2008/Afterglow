// Refine (ADR 0016): a picture of the drawing's strokes in, clean line art out, as SVG
// path data in a 1000x1000 viewBox. The model is behind an interface, so tests use a
// stand-in and the provider can change; whatever it answers is checked here before
// anything reaches the studio.

import { REFINE_MAX_PATHS, REFINE_VIEWBOX, svgPathToPolylines } from '@afterglow/core';
import { z } from 'zod';

/** What a model has to answer. */
export const RefineResult = z.object({
  title: z.string().trim().min(1).max(60),
  paths: z
    .array(z.object({ d: z.string().min(1).max(8000) }))
    .min(1)
    .max(REFINE_MAX_PATHS),
});
export type RefineResult = z.infer<typeof RefineResult>;

/** The same contract as JSON Schema, for providers that constrain their output to one. */
export const REFINE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'A short name for what the sketch shows, lower case, e.g. "a sailboat".' },
    paths: {
      type: 'array',
      minItems: 1,
      maxItems: REFINE_MAX_PATHS,
      items: {
        type: 'object',
        properties: { d: { type: 'string', description: 'SVG path data in the 1000x1000 viewBox.' } },
        required: ['d'],
      },
    },
  },
  required: ['title', 'paths'],
} as const;

export const REFINE_PROMPT = [
  `The image is a rough sketch drawn in the air with a finger, shown as dark lines on white.`,
  `Redraw it as clean, simple, stylized line art of the same subject: the same composition,`,
  `position, and proportions, so your lines land where the sketch's lines are.`,
  `Answer with SVG path data in a ${String(REFINE_VIEWBOX)}x${String(REFINE_VIEWBOX)} viewBox`,
  `matching the image, at most ${String(REFINE_MAX_PATHS)} paths. Each path is one continuous line,`,
  `as a pen would draw it: no fills, no text, no rectangles or circles as elements (use path`,
  `commands). Prefer smooth curves and few paths. Also give a short lower-case title.`,
].join(' ');

/** Why a refine failed, as the studio explains it. */
export type RefineErrorKind = 'rateLimited' | 'notConfigured' | 'timeout' | 'unavailable' | 'invalidOutput';

export class RefineError extends Error {
  readonly kind: RefineErrorKind;
  /** For rateLimited: seconds before trying again, if the provider said. */
  readonly retryAfter: number | null;

  constructor(kind: RefineErrorKind, message: string, retryAfter: number | null = null) {
    super(message);
    this.name = 'RefineError';
    this.kind = kind;
    this.retryAfter = retryAfter;
  }
}

/** A vision model that redraws a sketch. Returns its parsed JSON answer, unchecked. */
export interface RefineModel {
  readonly name: string;
  refine(png: Uint8Array, signal: AbortSignal): Promise<unknown>;
}

/** The answer, checked: the schema, and every path is valid path data. */
export function checkAnswer(answer: unknown): RefineResult | null {
  const parsed = RefineResult.safeParse(answer);
  if (!parsed.success) return null;
  if (!parsed.data.paths.every((p) => svgPathToPolylines(p.d, 10) !== null)) return null;
  return parsed.data;
}

/**
 * Asks the model, and asks once more if its answer doesn't check out. Errors from the
 * model itself (rate limits, timeouts) aren't retried: retrying wouldn't help.
 */
export async function refineSketch(
  model: RefineModel,
  png: Uint8Array,
  signal: AbortSignal,
): Promise<{ result: RefineResult; attempts: number }> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = checkAnswer(await model.refine(png, signal));
    if (result) return { result, attempts: attempt };
  }
  throw new RefineError('invalidOutput', 'The model twice answered with something that isn’t valid line art');
}
